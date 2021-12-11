import * as PIXI from 'pixi.js';

import deepEqual from 'fast-deep-equal';

import { presetManager } from '../presets';
import { geoScaleToZoom } from '@id-sdk/geo';
import { osmEntity } from '../osm';

export function pixiVertices(projection, context) {

    let scene = new Map();
    let sprites = {};
    let _didInit = false;


    function init(context) {
        const pixi = context.pixi;
        const loader = PIXI.Loader.shared;
        _didInit = true;
    }


    var _currHoverTarget;
    var _currPersistent = {};
    var _currHover = {};
    var _prevHover = {};
    var _currSelected = {};
    var _prevSelected = {};
    var _radii = {};


    function sortY(a, b) {
        return b.loc[1] - a.loc[1];
    }

    function render(graph, entities) {
        if (!_didInit) init(context);

        const pixi = context.pixi;

        var icons = {};
        var directions = {};


        function getIcon(d) {
            // always check latest entity, as fastEntityKey avoids enter/exit now
            var entity = graph.entity(d.id);
            if (entity.id in icons) return icons[entity.id];

            icons[entity.id] =
                entity.hasInterestingTags() &&
                presetManager.match(entity, graph).icon;

            return icons[entity.id];
        }


        // memoize directions results, return false for empty arrays (for use in filter)
        function getDirections(entity) {
            if (entity.id in directions) return directions[entity.id];

            var angles = entity.directions(graph, projection);
            directions[entity.id] = angles.length ? angles : false;
            return angles;
        }
        let vertices = entities.filter(entity => entity.geometry(graph) === 'vertex');
        vertices.sort(sortY);
        drawVertices(graph, vertices, true);
    }


    // Points can also render as vertices:
    // 1. in wireframe mode or
    // 2. at higher zooms if they have a direction
    function renderAsVertex(entity, graph, wireframe, zoom) {
        var geometry = entity.geometry(graph);
        return geometry === 'vertex' || (geometry === 'point' && (
            wireframe || (zoom >= 18 && entity.directions(graph, projection).length)
        ));
    }


    function isEditedNode(node, base, head) {
        var baseNode = base.entities[node.id];
        var headNode = head.entities[node.id];
        return !headNode ||
            !baseNode ||
            !deepEqual(headNode.tags, baseNode.tags) ||
            !deepEqual(headNode.loc, baseNode.loc);
    }


    function getSiblingAndChildVertices(ids, graph, wireframe, zoom) {
        var results = {};

        var seenIds = {};

        function addChildVertices(entity) {

            // avoid redundant work and infinite recursion of circular relations
            if (seenIds[entity.id]) return;
            seenIds[entity.id] = true;

            var geometry = entity.geometry(graph);
            if (!context.features().isHiddenFeature(entity, graph, geometry)) {
                var i;
                if (entity.type === 'way') {
                    for (i = 0; i < entity.nodes.length; i++) {
                        var child = graph.hasEntity(entity.nodes[i]);
                        if (child) {
                            addChildVertices(child);
                        }
                    }
                } else if (entity.type === 'relation') {
                    for (i = 0; i < entity.members.length; i++) {
                        var member = graph.hasEntity(entity.members[i].id);
                        if (member) {
                            addChildVertices(member);
                        }
                    }
                } else if (renderAsVertex(entity, graph, wireframe, zoom)) {
                    results[entity.id] = entity;
                }
            }
        }

        ids.forEach(function(id) {
            var entity = graph.hasEntity(id);
            if (!entity) return;

            if (entity.type === 'node') {
                if (renderAsVertex(entity, graph, wireframe, zoom)) {
                    results[entity.id] = entity;
                    graph.parentWays(entity).forEach(function(entity) {
                        addChildVertices(entity);
                    });
                }
            } else {  // way, relation
                addChildVertices(entity);
            }
        });

        return results;
    }


    function drawVertices(graph, entities, fullRedraw) {
        const pixi = context.pixi;
        var wireframe = context.surface().classed('fill-wireframe');
        var visualDiff = context.surface().classed('highlight-edited');
        var zoom = geoScaleToZoom(projection.scale());
        var mode = context.mode();
        var isMoving = mode && /^(add|draw|drag|move|rotate)/.test(mode.id);
        var base = context.history().base();


        if (fullRedraw) {
            _currPersistent = {};
            _radii = {};
        }

        // Collect important vertices from the `entities` list..
        // (during a partial redraw, it will not contain everything)
        for (var i = 0; i < entities.length; i++) {
            var entity = entities[i];
            var geometry = entity.geometry(graph);
            var keep = false;

            // a point that looks like a vertex..
            if ((geometry === 'point') && renderAsVertex(entity, graph, wireframe, zoom)) {
                _currPersistent[entity.id] = entity;
                keep = true;

            // a vertex of some importance..
            } else if (geometry === 'vertex' &&
                (entity.hasInterestingTags() || entity.isEndpoint(graph) || entity.isConnected(graph)
                || (visualDiff && isEditedNode(entity, base, graph)))) {
                _currPersistent[entity.id] = entity;
                keep = true;
            }

            // whatever this is, it's not a persistent vertex..
            if (!keep && !fullRedraw) {
                delete _currPersistent[entity.id];
            }
        }

        // Draw the vertices..
        let data = entities;

        //enter/update
        data.forEach(entity => {
            let vertex = scene.get(entity.id);

            if (!vertex) {
                const graphic = new PIXI.Graphics();
                const container = new PIXI.Container();
                graphic.name = entity.id;

                vertex = {
                    loc: entity.loc,
                    graphic: graphic,
                    container: container
                };

                scene.set(entity.id, vertex);
            }

            //update
            const coord = context.projection(vertex.loc);
            vertex.graphic
                .clear()
                .lineStyle(1, 0xff00ff)
                .beginFill(0xffffff, 0.5)
                .drawRoundedRect(-4, -4, 5, 5, 2)
                .endFill();

            vertex.container.x = coord[0];
            vertex.container.y = coord[1];
            vertex.container.addChild(vertex.graphic);
            pixi.stage.addChild(vertex.container);

        });

    }


    // partial redraw - only update the selected items..
    drawVertices.drawSelected = function(selection, graph, extent) {

        // drawVertices(selection, graph, Object.values(_prevSelected), filter, extent, false);
    };


    // partial redraw - only update the hovered items..
    drawVertices.drawHover = function(selection, graph, target, extent) {
    };

    return render;
}
