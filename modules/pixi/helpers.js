import * as PIXI from 'pixi.js';
import { vecAdd, vecAngle, vecEqual, vecLength } from '@id-sdk/math';


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
    spriteName = 'maki/' + iconName.slice('maki-'.length);
  } else if (isTemaki) {
    spritesheet = context._temakiSheet;
    spriteName = iconName.slice('temaki-'.length);
  } else {
    spritesheet = context._fontAwesomeSheet;
    spriteName = iconName;
  }

  spriteName = spriteName + '.svg';

  return spritesheet.textures[spriteName];
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


/**
 * lineToPoly
 * Use Pixi's built-in line builder to convert a line with some width into a polygon.
 * https://github.com/pixijs/pixijs/blob/dev/packages/graphics/src/utils/buildLine.ts
 *
 * @param  flatPoints  `Array` of [ x,y, x,y, … ] points that make up the line
 * @param  lineStyle   `Object` suitable to use as a lineStyle (important options are alignment and width)
 */
export function lineToPoly(flatPoints, lineStyle = {}) {
  const EPSILON = 1e-4;
  const first = [flatPoints[0], flatPoints[1]];
  const last = [flatPoints[flatPoints.length - 2], flatPoints[flatPoints.length - 1]];
  const isClosed = vecEqual(first, last, EPSILON);
  const sourceShape = new PIXI.Polygon(flatPoints);

  lineStyle.native = false;  // we want the non-native line builder
  sourceShape.closeStroke = false;  // don't make an extra segment from end to start

  // Make some fake graphicsData and graphicsGeometry.
  // (I'm avoiding using a real PIXI.Graphic because I dont want to affect the batch system)
  const graphicsData = { shape: sourceShape, lineStyle: lineStyle };
  const graphicsGeometry = { closePointEps: EPSILON, indices: [], points: [], uvs: [] };

  // Pixi will do the work for us.
  PIXI.graphicsUtils.buildLine(graphicsData, graphicsGeometry);


  // The `graphicsGeometry` now contains the points as they would be drawn (as a strip of triangles).
  // What we really want is a polygon representing the outer shape.
  //
  // Some findings about the `buildLine` triangulation code:
  //  - PIXI doesn't actually use GL_TRIANGLE_STRIP here, they are just normal GL_TRIANGLES.
  //  - They are a mix of ccw/cw winding (they don't follow the "ccw = frontface" convention)
  //  - Rounded caps/joins can add a lot of triangles, the code below can't handle them
  //  - Triangles with small area may be skipped (they appear in verts but not in indices)
  //
  // (it looks something like this)
  //
  //                        7 +…_
  //                         / \ "-…_
  //  L  0        2       4 / F \ G  + 8
  //     +-------_+-------_+…_   \  /
  //     | A _…-" | C _…-" |  "-…_\/
  //     |_-"   B |_-"   D | E _…-+
  //     +--------+--------+-""    6
  //  R  1        3        5
  //
  //  triangle:  A ccw  B cw   C ccw  D cw   E ccw  F ccw  G cw
  //   indices:  0 1 2  1 2 3  2 3 4  3 4 5  4 5 6  4 6 7  6 7 8  …
  //      side:  L R L  R L R  L R L  R L R  L R R  L R L  R L R  …

  const verts = graphicsGeometry.points;
  const indices = graphicsGeometry.indices;

  let sides = new Map();  // Map(index -> what side it's on) (`true` if left, `false` if right)
  let pathL = [];
  let pathR = [];
  let lastL;
  let lastR;
  let lenL = 0;
  let lenR = 0;

  // Sometimes `buildLine` skips triangles if they are too small, so keep track
  // of the previous triangle's verts and indices in case we need them.
  let vp0, vp1, vp2;
  let ip0, ip1, ip2;

  // Inspect each triangle in the strip.
  for (let j = 0; j < indices.length; j += 3) {
    const i0 = indices[j];
    const i1 = indices[j + 1];
    const i2 = indices[j + 2];
    const v0 = [ verts[(i0 * 2)], verts[(i0 * 2) + 1] ];
    const v1 = [ verts[(i1 * 2)], verts[(i1 * 2) + 1] ];
    const v2 = [ verts[(i2 * 2)], verts[(i2 * 2) + 1] ];

    // First triangle
    // Pick index 0 as the "left side" and index 1 as the "right side"
    if (j === 0) {
      sides.set(i0, true);   // left
      sides.set(i1, false);  // right
      sides.set(i2, true);   // left
      pathL.push(v0);
      pathR.push(v1);
      pathL.push(v2);
      lastR = v1;
      lastL = v2;
      lenL = vecLength(v0, v2);

    // Subsequent triangles
    // Each subsequent triangle in the strip should have:
    // - two "seen" vertices where we know their sides, and
    // - one "new" vertex where we need to figure out what side of the line it's on.
    } else {
      let s0 = sides.get(i0);
      let s1 = sides.get(i1);
      let s2 = sides.get(i2);

      // Sometimes `buildLine` skips triangles - (their verts appear in the vertex array but not the index array)
      // So first - check if any of the "new" verts in this triangle happen to match the previous triangle's verts
      if (s0 === undefined && vecEqual(v0, vp0, EPSILON)) {  // v0 and vp0 are the same point
        s0 = sides.get(ip0);
        sides.set(i0, s0);
      }
      if (s1 === undefined && vecEqual(v1, vp1, EPSILON)) {  // v1 and vp1 are the same point
        s1 = sides.get(ip1);
        sides.set(i1, s1);
      }
      if (s2 === undefined && vecEqual(v2, vp2, EPSILON)) {  // v2 and vp2 are the same point
        s2 = sides.get(ip2);
        sides.set(i2, s2);
      }

      // Given 2 "seen" vertex sides, what side would the third vertex be on?
      // `buildLine` puts the new side on the opposite of the "previous" vertex side.
      // There is no requirement to build the lines this way, it's just how `buildLine` works.
      // (round caps and joins aren't always this way, so this code doesn't support them!)

      // One of these should be the "new" vertex..
      let inew, vnew, snew;
      if (s0 === undefined) {
        inew = i0;
        vnew = v0;
        snew = !s2;
      }
      if (s1 === undefined) {
        inew = i1;
        vnew = v1;
        snew = !s0;
      }
      if (s2 === undefined) {
        inew = i2;
        vnew = v2;
        snew = !s1;
      }

      // Append the new vertex to either the left or right side path
      if (inew !== undefined) {
        sides.set(inew, snew);  // snew = `true` if left, `false` if right
        if (snew === true) {
          pathL.push(vnew);
          lenL += vecLength(lastL, vnew);
          lastL = vnew;
        } else {
          pathR.push(vnew);
          lenR += vecLength(lastR, vnew);
          lastR = vnew;
        }
      }  // else we've seen all these vertices before - shouldnt happen?
    }

    // Remember current verts and indices for next loop iteration
    vp0 = v0; vp1 = v1; vp2 = v2;
    ip0 = i0; ip1 = i1; ip2 = i2;
  }


  const result = {};

  // This path can be used as an array of points for the hitArea.
  // Go out on one side and back on the other, then close it off.
  const len = pathL.length + pathR.length + 1;
  const perimeter = new Array(len * 2);
  let i = 0;
  for (let j = 0; j < pathL.length; ++i, ++j) {   // flatten coords
    perimeter[i * 2] = pathL[j][0];
    perimeter[i * 2 + 1] = pathL[j][1];
  }

  pathR.reverse();
  for (let j = 0; j < pathR.length; ++i, ++j) {   // flatten coords
    perimeter[i * 2] = pathR[j][0];
    perimeter[i * 2 + 1] = pathR[j][1];
  }
  // close the shape
  perimeter[perimeter.length - 2] = perimeter[0];
  perimeter[perimeter.length - 1] = perimeter[1];

  result.perimeter = perimeter;

  // If the line was closed, determine which path is longer (outer) and shorter (inner)
  if (isClosed) {
    const pointsL = new Array((pathL.length + 1) * 2);
    for (let j = 0; j < pathL.length; ++j) {   // flatten coords
      pointsL[j * 2] = pathL[j][0];
      pointsL[j * 2 + 1] = pathL[j][1];
    }
    // close the shape
    pointsL[pointsL.length - 2] = pathL[0][0];
    pointsL[pointsL.length - 1] = pathL[0][1];

    const pointsR = new Array((pathR.length + 1) * 2);
    for (let j = 0; j < pathR.length; ++j) {   // flatten coords
      pointsR[j * 2] = pathR[j][0];
      pointsR[j * 2 + 1] = pathR[j][1];
    }
    // close the shape
    pointsR[pointsR.length - 2] = pathR[0][0];
    pointsR[pointsR.length - 1] = pathR[0][1];

    if (lenL > lenR) {
      result.outer = pointsL;
      result.inner = pointsR;
    } else {
      result.outer = pointsR;
      result.inner = pointsL;
    }
  }

  return result;
}


/**
 * getLineSegments
 * @param   points    the series of Vec[2] arrays delineating each waypoint
 * @param   spacing   Number indicating the distance between segments (arrows, sided arrows, etc)
 * @param   isSided    optional Boolean, applying a 'sided' style to the line, arrows will be drawn perpendicular to the line segments.
 * @param   isLimited  optional Boolean, whether to limit the number (temporary, see below)
 * @returns Array of segment Objects
 */
export function getLineSegments(points, spacing, isSided = false, isLimited = false) {
  const SIDEDOFFSET = 7;

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

        let sided_dx = 0;
        let sided_dy = 0;
        // For 'sided' segments, we want to offset the arrows so that they are not centered on the line segment's path
        if (isSided) {
          sided_dx = SIDEDOFFSET * Math.cos(heading + Math.PI / 2);
          sided_dy = SIDEDOFFSET * Math.sin(heading + Math.PI / 2);
        }

        let p = [
          a[0] + offset * Math.cos(heading) + sided_dx,
          a[1] + offset * Math.sin(heading) + sided_dy
        ];

        // generate coordinates between `a` and `b`, spaced `spacing` apart
        let coords = [a, p];

// temporary, see https://github.com/facebook/RapiD/issues/544
// If we are going to generate more than 100 line segments,
// cap it at 100 so we're not adding thousands of oneway arrows.
if (isLimited && (span >= spacing * 100)) {
  const newSpacing = Math.floor(span / 100);
  // console.log(`skipped calculating ${Math.floor(span / spacing) - 100} segments.`);
  spacing = newSpacing;
}

        for (span -= spacing; span >= 0; span -= spacing) {
          p = vecAdd(p, [dx, dy]);
          coords.push(p);
        }
        coords.push(b);

        segments.push({
          coords: coords.slice(1, -1),   // skip first and last
          angle: heading + (isSided ? Math.PI / 2 : 0)
        });
      }

      offset = -span;
    }
    a = b;
  }

  return segments;
}


export function getDebugBBox(x, y, width, height, color, alpha, name) {
  const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
  sprite.interactive = false;
  sprite.interactiveChildren = false;
  sprite.anchor.set(0, 0);  // top, left
  sprite.position.set(x, y);
  sprite.width = width;
  sprite.height = height;
  sprite.tint = color || 0xffff33;  // yellow
  sprite.alpha = alpha || 0.75;
  if (name) sprite.name = name;
  return sprite;
}
