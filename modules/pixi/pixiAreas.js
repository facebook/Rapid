import * as PIXI from 'pixi.js';
import { range as d3_range } from 'd3-array';
import { utilArrayFlatten, utilArrayGroupBy } from '@id-sdk/util';

import _isEqual from 'lodash-es/isEqual';
import _omit from 'lodash-es/omit';
import deepEqual from 'fast-deep-equal';

import { svgMarkerSegments, svgPath, svgRelationMemberTags, svgSegmentWay } from '../svg/helpers';
import { svgTagClasses } from '../svg/tag_classes';
import { osmEntity, osmOldMultipolygonOuterMember } from '../osm';
import { utilDetect } from '../util/detect';
import { rapid_config } from '../../data/rapid_config.json';


export function pixiAreas(projection, context) {
    var detected = utilDetect();
    let scene = new Map();
    let sprites = {};
    let _didInit = false;


    function init(context) {
        const pixi = context.pixi;
        const loader = PIXI.Loader.shared;
        _didInit = true;
    }


    var highway_stack = {
        motorway: 0,
        motorway_link: 1,
        trunk: 2,
        trunk_link: 3,
        primary: 4,
        primary_link: 5,
        secondary: 6,
        tertiary: 7,
        unclassified: 8,
        residential: 9,
        service: 10,
        footway: 11
    };


    function render(graph, entities) {
        if (!_didInit) init(context);
        const pixi = context.pixi;

        let pathData = entities
            .filter(entity => entity.geometry(graph) === 'area');

        // gather ids to keep
        let keep = {};
        pathData
        .forEach(entity => keep[entity.id] = true);

        // exit
        [...scene.entries()].forEach(([id, pathData]) => {
        if (!keep[id]) {
            pixi.stage.removeChild(pathData.graphics);
            scene.delete(id);
        }
        });

        // enter/update
        pathData
        .forEach(way => {
            let area = scene.get(way.id);
            // make poly if needed
            if (!area) {
            const geojson = way.asGeoJSON(graph);
            const coords = geojson.coordinates[0];

            const graphics = new PIXI.Graphics();
            graphics.name = way.id;

            area = {
                color: 0xff00ff,
                coords: coords,
                graphics: graphics
            };
            scene.set(way.id, area);
            }

            // update
            const path = utilArrayFlatten(area.coords.map(coord => context.projection(coord)));
            area.graphics.clear();
            area.graphics.lineStyle({
                color: 0xff26db,
                width: 3,
            });
            area.graphics.beginFill(area.color, 0.4);
            area.graphics.drawPolygon(path);
            area.graphics.endFill();

            pixi.stage.addChild(area.graphics);
        });

        //TODO: Worry about covered vs. uncovered

        //TODO: Add markers, one-way indicators
    }


    return render;
}
