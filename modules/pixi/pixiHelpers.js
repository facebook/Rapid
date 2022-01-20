import * as PIXI from 'pixi.js';
import { vecAdd, vecAngle, vecLength } from '@id-sdk/math';
import { svgTagPattern } from '../svg/tag_pattern';


const iconViewfield = new PIXI.Graphics()
  .lineStyle(0.75, 0xffffff)
  .beginFill(0x333333, 0.75)
  .moveTo(6, 14)
  .bezierCurveTo(8,13.4, 8,13.4, 10,14)
  .lineTo(16,3)
  .bezierCurveTo(12,0, 4,0, 0,3)
  .closePath()
  .endFill();


/**
* Generates a pixi container with viewfield icons rotated appropriately
* @param context main iD context obj.
* @param {Array<number>} directions an array of directional angles in degrees, 'UP' is zero degrees
* @returns {PIXI.Container} A container with the ViewfieldSprites rotated according to the supplied directions.
 */
export function getViewfieldContainerHelper(context, directions) {
  let _initViewfieldSprite = false;
  let _vfTexture;
  let _vfSprite;


  function initViewfieldSprite(context) {
    const renderer = context.pixi.renderer;
    _vfTexture = renderer.generateTexture(iconViewfield, { resolution: 2 });
    _vfSprite = new PIXI.Sprite(_vfTexture);
    _vfSprite.scale.set(1.6, 1.6);
    _vfSprite.anchor.set(0.5, 1);
  }


  if (!_initViewfieldSprite) {
    initViewfieldSprite(context);
    _initViewfieldSprite = true;
  }

  const vfContainer = new PIXI.Container();

  vfContainer.name = 'viewfields';
  if (directions.length > 0) {

    directions.forEach(direction => {
      _vfSprite.angle = direction;
      vfContainer.addChild(_vfSprite);
    });
  }

  return vfContainer;
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

  spriteName = spriteName + (isMaki ? '-11' : '') + '.svg';

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
