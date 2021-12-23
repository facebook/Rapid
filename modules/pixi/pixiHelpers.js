import * as PIXI from 'pixi.js';
import {
    geoIdentity as d3_geoIdentity,
    geoStream as d3_geoStream
} from 'd3-geo';

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
  }
  else {
    spritesheet = context._fontAwesomeSheet;
    spriteName = picon;
  }

    spriteName = spriteName + (isMaki ? '-11' : '') + '.svg';
    return new PIXI.Sprite(spritesheet.textures[spriteName]);
}


export function pixiOnewayMarkerPoints(projection, graph, dt,
                                  shouldReverse) {
  return function (entity) {
        var i = 0;
        var offset = dt;
        var markerPoints = [];
        var clip = d3_geoIdentity().clipExtent(projection.clipExtent()).stream;
        var coordinates = graph.childNodes(entity).map(function(n) { return n.loc; });
        var a, b;

        if (shouldReverse(entity)) {
            coordinates.reverse();
        }

        d3_geoStream({
            type: 'LineString',
            coordinates: coordinates
        }, projection.stream(clip({
            lineStart: function() {},
            lineEnd: function() { a = null; },
            point: function(x, y) {
                b = [x, y];

                if (a) {
                    var span = vecLength(a, b) - offset;

                    if (span >= 0) {
                        var heading = vecAngle(a, b);
                        var dx = dt * Math.cos(heading);
                        var dy = dt * Math.sin(heading);
                        var p = [
                            a[0] + offset * Math.cos(heading),
                            a[1] + offset * Math.sin(heading)
                        ];

                        // gather coordinates
                        var coord = [a, p];
                        for (span -= dt; span >= 0; span -= dt) {
                            p = vecAdd(p, [dx, dy]);
                            coord.push(p);
                        }
                        coord.push(b);

                        markerPoints.push({ id: entity.id, index: i++, coords: coord.slice(1,-1), angle: heading });

                    }

                    offset = -span;
                }

                a = b;
            }
        })));

        return markerPoints;
    };
}
