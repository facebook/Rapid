import * as PIXI from 'pixi.js';
import { vecAdd, vecAngle, vecLength } from '@id-sdk/math';


/**
* Generates a icon sprite for the given texture name
* @returns {PIXI.Sprite}
*/
export function getIconTexture(context, iconName) {
  const isMaki = /^maki-/.test(iconName);
  const isTemaki = /^temaki-/.test(iconName);

  let spritesheet;
  let spriteName;
  if (isMaki) {
    spritesheet = context._makiSheet;
    spriteName = iconName.slice('maki-'.length);
  } else if (isTemaki) {
    spritesheet = context._temakiSheet;
    spriteName = iconName.slice('temaki-'.length);
  } else {
    spritesheet = context._fontAwesomeSheet;
    spriteName = iconName;
  }

  spriteName = spriteName + (isMaki ? '-15' : '') + '.svg';

  return spritesheet.textures[spriteName];
}


/**
* Generates a icon sprite for the given texture name
* @returns {PIXI.Sprite}
*/
export function getIconSprite(context, iconName) {
  const isMaki = /^maki-/.test(iconName);
  const isTemaki = /^temaki-/.test(iconName);

  let spritesheet;
  let spriteName;
  if (isMaki) {
    spritesheet = context._makiSheet;
    spriteName = iconName.slice('maki-'.length);
  } else if (isTemaki) {
    spritesheet = context._temakiSheet;
    spriteName = iconName.slice('temaki-'.length);
  } else {
    spritesheet = context._fontAwesomeSheet;
    spriteName = iconName;
  }

  spriteName = spriteName + (isMaki ? '-15' : '') + '.svg';

  const sprite = new PIXI.Sprite(spritesheet.textures[spriteName]);
  sprite.name = spriteName;
  sprite.interactive = false;
  sprite.interactiveChildren = false;
  sprite.anchor.set(0.5, 0.5);   // middle, middle

  return sprite;
}


/**
* Generates a pixi container with viewfield icons rotated appropriately
* @param texture
* @param {Array<number>} directions an array of directional angles in degrees, 'UP' is zero degrees
* @returns {PIXI.Container} A container with the ViewfieldSprites rotated according to the supplied directions.
*/
export function getViewfieldContainer(texture, directions, tint) {
  const vfContainer = new PIXI.Container();
  vfContainer.name = 'viewfields';
  vfContainer.interactive = false;
  vfContainer.interactiveChildren = false;

  directions.forEach(direction => {
    const sprite = new PIXI.Sprite(texture);
    sprite.interactive = false;
    sprite.interactiveChildren = false;
    sprite.tint = tint || 0x333333;
    sprite.anchor.set(0.5, 1);  // middle, top
    sprite.angle = direction;
    vfContainer.addChild(sprite);
  });

  return vfContainer;
}


/**
* Generates a polygon from a line. Intended for use to create custom hit areas for our ways.
* @param width the width of the polygon in pixels (deviation from either side of the line))
* @param {Array<points>} A list of point coord pairs that denote the line.
* @returns {PIXI.Polygon} The polygon encasing the line with specified width.
* method pilfered from https://jsfiddle.net/bigtimebuddy/xspmq8au/
*/
export function lineToPolygon(width, points) {
  const numPoints = points.length / 2;
  const output = new Array(points.length * 2);
  for (let i = 0; i < numPoints; i++) {
    const j = i * 2;

    // Position of current point
    const x = points[j];
    const y = points[j + 1];

    // Start
    const x0 = points[j - 2] !== undefined ? points[j - 2] : x;
    const y0 = points[j - 1] !== undefined ? points[j - 1] : y;

    // End
    const x1 = points[j + 2] !== undefined ? points[j + 2] : x;
    const y1 = points[j + 3] !== undefined ? points[j + 3] : y;

    // Get the angle of the line
    const a = Math.atan2(-x1 + x0, y1 - y0);
    const deltaX = width * Math.cos(a);
    const deltaY = width * Math.sin(a);

    // Add the x, y at the beginning
    output[j] = x + deltaX;
    output[j + 1] = y + deltaY;

    // Add the reflected x, y at the end
    output[(output.length - 1) - j - 1] = x - deltaX;
    output[(output.length - 1) - j] = y - deltaY;
  }
  // close the shape
  output.push(output[0], output[1]);

  return new PIXI.Polygon(output);
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
  bbox.interactive = false;
  bbox.interactiveChildren = false;
  bbox.anchor.set(0, 0);  // top, left
  bbox.position.set(x, y);
  bbox.width = width;
  bbox.height = height;
  bbox.tint = color || 0xffff33;  // yellow
  bbox.alpha = alpha || 0.75;
  if (name) bbox.name = name;
  return bbox;
}
