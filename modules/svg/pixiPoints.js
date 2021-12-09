import * as PIXI from 'pixi.js';

import deepEqual from 'fast-deep-equal';
import { geoScaleToZoom } from '@id-sdk/geo';
import { osmEntity } from '../osm';
import { svgPointTransform } from './helpers';
import { presetManager } from '../presets';

export function pixiPoints(projection, context) {

    let pixicache = new Map();   // map of OSM ID -> Pixi Graphic


    // Avoid exit/enter if we're just moving stuff around.
    // The node will get a new version but we only need to run the update selection.
    function fastEntityKey(d) {
        var mode = context.mode();
        var isMoving = mode && /^(add|draw|drag|move|rotate)/.test(mode.id);
        return isMoving ? d.id : osmEntity.key(d);
    }


    function render(graph, entities) {
        var points = entities.filter(entity => entity.geometry(graph) === 'point');
        points.sort((a, b) => b.loc[1] - a.loc[1]);

        const pixi = context.pixi;

        // get visible data
        let keepIDs = {};

        points
          .forEach(d => keepIDs[d.id] = true);

        // exit
        [...pixicache.entries()].forEach(entry => {
          const k = entry[0];
          const obj = entry[1];
          if (!keepIDs[k]) {
            pixi.stage.removeChild(obj.graphics);
            pixicache.delete(k);
          }
        });

        // enter/update
        points
          .forEach(entity => {
            let point = pixicache.get(entity.id);

            // make point if needed
            if (!point) {
              const graphics = new PIXI.Graphics();
              graphics.name = entity.id;
              pixi.stage.addChild(graphics);

              point = {
                color: 0xffffff,
                loc: entity.loc,
                graphics: graphics
              };
              pixicache.set(entity.id, point);
            }

            // update
            const coord = context.projection(point.loc);
            point.graphics.clear();
            point.graphics.lineStyle(0);
            point.graphics.beginFill(point.color, 0.9);
            point.graphics.drawCircle(coord[0], coord[1], 10);
            point.graphics.endFill();
          });




        // // Draw points..
        // var groups = drawLayer.selectAll('g.point')
        //     .filter(filter)
        //     .data(points, fastEntityKey);

        // groups.exit()
        //     .remove();

        // var enter = groups.enter()
        //     .append('g')
        //     .attr('class', function(d) { return 'node point ' + d.id; })
        //     .order();

    }


    return render;
}
