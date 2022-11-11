import { Extent, geomPointInPolygon } from '@id-sdk/math';
import { utilArrayIntersection } from '@id-sdk/util';

import { locationManager } from '../core/LocationManager';
import { modeSelect } from '../modes/select';
import { uiLasso } from '../ui/lasso';
import { AbstractBehavior } from './AbstractBehavior';


export class BehaviorLasso extends AbstractBehavior {

    /**
     * @constructor
     * @param  `context`  Global shared application context
     */
    constructor(context) {
        super(context);
        this.id = 'lasso';
        this.lasso = null;
        this._lassoing = false;
        this._extent = null;
        this._points = []; // A series of x,y screen coords that we record while lassoing.

        this._pointerdown = this._pointerdown.bind(this);
        this._pointermove = this._pointermove.bind(this);
        this._pointerup = this._pointerup.bind(this);
    }

    enable() {
        if (this._enabled) return;

        this._enabled = true;
        const eventManager = this.context.map().renderer.events;
        eventManager.on('pointerdown', this._pointerdown);
        eventManager.on('pointermove', this._pointermove);
        eventManager.on('pointerup', this._pointerup);
    }

    disable() {
        if (!this._enabled) return;

        this._enabled = false;

        this._lassoing = false;
        const eventManager = this.context.map().renderer.events;
        eventManager.off('pointerdown', this._pointerdown);
        eventManager.off('pointermove', this._pointermove);
        eventManager.off('pointerup', this._pointerup);
    }

     _pointerdown(e) {

        // Ignore it if we are not over the canvas
        // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
         const eventManager = this.context.map().renderer.events;
         if (!eventManager.pointerOverRenderer) return;


        const move = this._getEventData(e);
         const modifiers = eventManager.modifierKeys;
         const drawLasso = modifiers.has('Shift');

         if (drawLasso) {
             this._lassoing = true;
             this._extent = new Extent(move.coord);
             this._points.push(move.coord);
         }
    }


    _pointermove(e) {
        if (!this._lassoing) return;
        const eventManager = this.context.map().renderer.events;
        if (!eventManager.pointerOverRenderer) return;
        const move = this._getEventData(e);
        this._extent = this._extent.extend(new Extent(move.coord));
        this._points.push(move.coord);
    }

    _pointerup() {

        if (!this._lassoing) return;

        this._lassoing = false;

        var ids = this._lassoed();

        if (ids.length) {
            this.context.enter(modeSelect(this.context, ids));
        }
    }

    // After inverting the projection from screen coordintes to wgs84 coordinates
    // we need to fix min/max (in screen +y is down, in wgs84 +y is up)
    _normalize(a, b) {
        return [
            [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
            [Math.max(a[0], b[0]), Math.max(a[1], b[1])]
        ];
    }


    _lassoed() {
        const graph = this.context.graph();
        const context = this.context;
        const polygonPoints = this._points;

        if (!this.context.editable()) return [];

        var extent = this._extent;  // extent in screen coordinates
        var bounds = this._normalize(this.context.projection.invert(extent.min), this.context.projection.invert(extent.max));
        var wgs84Extent = new Extent(bounds[0], bounds[1]);

        var intersects = this.context.history().intersects(wgs84Extent).filter(function(entity) {
            return entity.type === 'node' &&
                geomPointInPolygon(context.projection.project(entity.loc), polygonPoints) &&
                !context.features().isHidden(entity, graph, entity.geometry(graph)) &&
                !locationManager.blocksAt(entity.loc).length;
        });

        // sort the lassoed nodes as best we can
        intersects.sort(function(node1, node2) {
            var parents1 = graph.parentWays(node1);
            var parents2 = graph.parentWays(node2);
            if (parents1.length && parents2.length) {
                // both nodes are vertices

                var sharedParents = utilArrayIntersection(parents1, parents2);
                if (sharedParents.length) {
                    var sharedParentNodes = sharedParents[0].nodes;
                    // vertices are members of the same way; sort them in their listed order
                    return sharedParentNodes.indexOf(node1.id) -
                        sharedParentNodes.indexOf(node2.id);
                } else {
                    // vertices do not share a way; group them by their respective parent ways
                    return parseFloat(parents1[0].id.slice(1)) -
                        parseFloat(parents2[0].id.slice(1));
                }

            } else if (parents1.length || parents2.length) {
                // only one node is a vertex; sort standalone points before vertices
                return parents1.length - parents2.length;
            }
            // both nodes are standalone points; sort left to right
            return node1.loc[0] - node2.loc[0];
        });

        return intersects.map(function(entity) { return entity.id; });
    }


}
