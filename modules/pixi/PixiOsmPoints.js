import * as PIXI from 'pixi.js';

import { presetManager } from '../presets';
import { getIconSpriteHelper } from './helpers';


export function PixiOsmPoints(context, featureCache) {
  let _textures = {};
  let _didInit = false;

  //
  // prepare template geometry
  // prettier-ignore
  function initPointTextures() {
    const marker = new PIXI.Graphics()                                    //              [0,-23]
      .lineStyle(1, 0x444444)                                 //              _,-+-,_
      .beginFill(0xffffff, 1)                                 //            /'       `\
      .moveTo(0, 0)                                                  //           :           :
      .bezierCurveTo(-2,-2, -8,-10, -8,-15)    // [-8,-15]  :           :  [8,-15]
      .bezierCurveTo(-8,-19, -4,-23, 0,-23)    //            \         /
      .bezierCurveTo(4,-23, 8,-19, 8,-15)      //             \       /
      .bezierCurveTo(8,-10, 2,-2, 0,0)         //              \     /
      .closePath()                                                        //               \   /      -y
      .endFill();                                                         //                `+`        |
                                                                          //               [0,0]       +-- +x

    const wikidataMarker = new PIXI.Graphics()
      .lineStyle(2, 0x666666)
      .beginFill(0xdddddd, 1)
      .moveTo(0, 0)
      .bezierCurveTo(-2,-2, -8,-10, -8,-15)
      .bezierCurveTo(-8,-19, -4,-23, 0,-23)
      .bezierCurveTo(4,-23, 8,-19, 8,-15)
      .bezierCurveTo(8,-10, 2,-2, 0,0)
      .closePath()
      .endFill();

    const iconPlain = new PIXI.Graphics()
      .lineStyle(1, 0x666666)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 8)
      .endFill();

    const taggedPlain = new PIXI.Graphics()
      .lineStyle(1, 0x666666)
      .beginFill(0xffffff, 1)
      .drawCircle(0, 0, 4.5)
      .beginFill(0x000000, 1)
      .drawCircle(0, 0, 1.5)
      .endFill();

    const taggedWikidata = new PIXI.Graphics()
      .lineStyle(1, 0x666666)
      .beginFill(0xdddddd, 1)
      .drawCircle(0, 0, 4.5)
      .beginFill(0x333333, 1)
      .drawCircle(0, 0, 1.5)
      .endFill();

    // convert graphics to textures/sprites for performance
    // https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
    const renderer = context.pixi.renderer;
    const options = { resolution: 2 };
    _textures.marker = renderer.generateTexture(marker, options);
    _textures.wikidataMarker = renderer.generateTexture(wikidataMarker, options);
    _textures.iconPlain = renderer.generateTexture(iconPlain, options);
    _textures.taggedPlain = renderer.generateTexture(taggedPlain, options);
    _textures.taggedWikidata = renderer.generateTexture(taggedWikidata, options);

    _didInit = true;
  }


  //
  // render
  //
  function renderPoints(layer, projection, entities) {
    if (!_didInit) initPointTextures();

    const graph = context.graph();
    const k = projection.scale();
    const effectiveZoom = context.map().effectiveZoom();
    const SHOWBBOX = false;

    function isPoint(entity) {
      return entity.type === 'node' && entity.geometry(graph) === 'point';
    }

    // Special style for Wikidata-tagged items
    function hasWikidata(entity) {
      return (
        entity.tags.wikidata ||
        entity.tags['flag:wikidata'] ||
        entity.tags['brand:wikidata'] ||
        entity.tags['network:wikidata'] ||
        entity.tags['operator:wikidata']
      );
    }


    // enter/update
    entities
      .filter(isPoint)
      .forEach(function preparePoints(node) {
        let feature = featureCache.get(node.id);
        const hasWd = hasWikidata(node);

        if (!feature) {   // make point if needed
          const container = new PIXI.Container();
          container.name = node.id;
          container.__data__ = node;
          container.interactive = true;
          container.buttonMode = true;
          container.sortableChildren = false;
          container.zIndex = -node.loc[1];  // sort by latitude ascending

          layer.addChild(container);

          const t = hasWd ? 'wikidataMarker' : 'marker';
          const marker = new PIXI.Sprite(_textures[t]);
          marker.name = 'marker';
          marker.interactive = false;
          marker.interactiveChildren = false;
          marker.sortableChildren = false;
          marker.anchor.set(0.5, 1);  // middle, bottom
          container.addChild(marker);

          const bbox = new PIXI.Graphics();
          bbox.name = node.id + '-bbox';
          bbox.interactive = false;
          bbox.interactiveChildren = false;
          bbox.sortableChildren = false;
          bbox.visible = SHOWBBOX;
          container.addChild(bbox);

          const preset = presetManager.match(node, graph);
          const picon = preset && preset.icon;

          let icon;
          if (picon) {
            icon = getIconSpriteHelper(context, picon);
            const iconsize = 11;
            // mathematically 0,-15 is center of marker, move down slightly
            icon.position.set(0, -14);
            icon.width = iconsize;
            icon.height = iconsize;
            icon.alpha = hasWd ? 0.6 : 1;
            container.addChild(icon);
          }

          feature = {
            type: 'point',
            displayObject: container,
            localBounds: new PIXI.Rectangle(),
            loc: node.loc,
            marker: marker,
            icon: icon,
            bbox: bbox
          };

          featureCache.set(node.id, feature);
        }

        // Remember scale and reproject only when it changes
        if (k === feature.k) return;
        feature.k = k;

        // effectiveZoom adjustments
        if (effectiveZoom < 16) {                               // show nothing
          feature.displayObject.visible = false;
          return;  // exit early

        } else if (effectiveZoom < 17) {                        // show circles
          feature.marker.texture = _textures.iconPlain;
          feature.marker.anchor.set(0.5, 0.5);  // middle, middle
          if (feature.icon) {
            feature.icon.position.set(0, 0);
          }
          feature.displayObject.visible = true;
          feature.displayObject.scale.set(0.8, 0.8);

        } else {
          const t = hasWd ? 'wikidataMarker' : 'marker';         // show pins
          feature.marker.texture = _textures[t];
          feature.marker.anchor.set(0.5, 1);  // middle, bottom
          if (feature.icon) {
            // mathematically 0,-15 is center of marker, move down slightly
            feature.icon.position.set(0, -14);
          }
          feature.displayObject.visible = true;
          feature.displayObject.scale.set(1, 1);
        }

        // Reproject and recalculate the bounding box
        const [x, y] = projection.project(feature.loc);
        feature.displayObject.position.set(x, y);

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
            .drawShape(feature.localBounds);
        }
      });
  }


  return renderPoints;
}
