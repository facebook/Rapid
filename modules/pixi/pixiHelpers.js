import * as PIXI from 'pixi.js';
import { vecAdd, vecAngle, vecLength } from '@id-sdk/math';


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
