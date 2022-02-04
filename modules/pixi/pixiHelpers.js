import * as PIXI from 'pixi.js';
import { vecAdd, vecAngle, vecLength } from '@id-sdk/math';
import { svgTagPattern } from '../svg/tag_pattern';

let _vfTexture;

/**
* Generates a pixi container with viewfield icons rotated appropriately
* @param context main iD context obj.
* @param {Array<number>} directions an array of directional angles in degrees, 'UP' is zero degrees
* @returns {PIXI.Container} A container with the ViewfieldSprites rotated according to the supplied directions.
*/
export function getViewfieldContainerHelper(context, directions, color) {
  if (!_vfTexture) {
    const renderer = context.pixi.renderer;
    const viewfieldRect = new PIXI.Rectangle(-13, 0, 26, 26);
    const iconViewfield = new PIXI.Graphics()
      .lineStyle(1, 0xcccccc)                  //  [-6,21]  ,-___-,  [6,21]
      .beginFill(0xffffff, 0.75)               //          /       \
      .moveTo(-6, 21)                          //         /         \
      .bezierCurveTo(-5,19, 5,19, 6,21)        //        /           \
      .lineTo(12, 4)                           //       /             \
      .bezierCurveTo(12,0, -12,0, -12,4)       //       ""--_______--""         +y
      .closePath()                             // [-12,4]              [12,4]    |
      .endFill();                              //            [0,0]               +-- +x

    _vfTexture = renderer.generateTexture(iconViewfield, {
      region: viewfieldRect,  // texture the whole 26x26 region
      resolution: 3           // oversample a bit so it looks pretty when rotated
    });
  }

  const vfContainer = new PIXI.Container();
  vfContainer.name = 'viewfields';

  directions.forEach(direction => {
    const vfSprite = new PIXI.Sprite(_vfTexture);
    vfSprite.tint = color ? color : 0x333333;
    vfSprite.anchor.set(0.5, 1);  // middle, top
    vfSprite.angle = direction;
    vfContainer.addChild(vfSprite);
  });

  return vfContainer;
}

export function getMapillaryIconSpriteHelper(context, picon) {
  const spritesheet = context._mapillarySheet;
  let sprite = new PIXI.Sprite(spritesheet.textures[picon + '.svg']);
  sprite.name = picon;
  sprite.anchor.set(0.5, 0.5);
  return sprite;
}


export function getMapillarySignIconSpriteHelper(context, picon) {
  const spritesheet = context._mapillarySignSheet;
  let sprite = new PIXI.Sprite(spritesheet.textures[picon + '.svg']);
  sprite.name = picon;
  sprite.anchor.set(0.5, 0.5);
  return sprite;
}


export function getIconSpriteHelper(context, picon) {
  const isMaki = /^maki-/.test(picon);
  const isTemaki = /^temaki-/.test(picon);

  let spritesheet;
  let spriteName;
  if (isMaki) {
    spritesheet = context._makiSheet;
    spriteName = picon.slice('maki-'.length);
  } else if (isTemaki) {
    spritesheet = context._temakiSheet;
    spriteName = picon.slice('temaki-'.length);
  } else {
    spritesheet = context._fontAwesomeSheet;
    spriteName = picon;
  }

  spriteName = spriteName + (isMaki ? '-15' : '') + '.svg';

  let sprite = new PIXI.Sprite(spritesheet.textures[spriteName]);
  sprite.name = spriteName;
  sprite.anchor.set(0.5, 0.5);   // middle, middle

  return sprite;
}


export function getPixiTagPatternKey(context, tags) {
  let svgPattern = svgTagPattern(tags);
  if (svgPattern) {
    let key = svgPattern.split('-')[1];

    if (context.pixi.rapidTextureKeys.includes(key)) {
      return key;
    }
  }
  return null;
}


export function getLineSegments(points, spacing) {
  let offset = spacing;
  let a;

  let segments = [];
  for (let i = 0; i < points.length; i++) {
    const b = points[i];

    if (a) {
      let span = vecLength(a, b) - offset;

      if (span >= 0) {
        const heading = vecAngle(a, b);
        const dx = spacing * Math.cos(heading);
        const dy = spacing * Math.sin(heading);
        let p = [
          a[0] + offset * Math.cos(heading),
          a[1] + offset * Math.sin(heading)
        ];

        // generate coordinates between `a` and `b`, spaced `spacing` apart
        let coords = [a, p];
        for (span -= spacing; span >= 0; span -= spacing) {
          p = vecAdd(p, [dx, dy]);
          coords.push(p);
        }
        coords.push(b);

        segments.push({
          coords: coords.slice(1,-1),   // skip first and last
          angle: heading
        });
      }

      offset = -span;
    }
    a = b;
  }

  return segments;
}


export function getDebugBBox(x, y, width, height, color, alpha, name) {
  const bbox = new PIXI.Sprite(PIXI.Texture.WHITE);
  bbox.anchor.set(0, 0);  // top, left
  bbox.position.set(x, y);
  bbox.width = width;
  bbox.height = height;
  bbox.tint = color || 0xffff33;  // yellow
  bbox.alpha = alpha || 0.75;
  if (name) bbox.name = name;
  return bbox;
}
