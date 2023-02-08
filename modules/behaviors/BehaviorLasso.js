import { Extent, geomPointInPolygon } from '@id-sdk/math';
import { utilArrayIntersection } from '@id-sdk/util';

import { locationManager } from '../core/LocationManager';
import { modeSelect } from '../modes/select';
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

    this._coords = [];   // A series of lat/lon coords that we record while lassoing.
    this._pointerdown = this._pointerdown.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._pointerup = this._pointerup.bind(this);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;
    this._enabled = true;

    this._lassoing = false;
    this._extent = null;

    const eventManager = this.context.map().renderer.events;
    eventManager.on('pointerdown', this._pointerdown);
    eventManager.on('pointermove', this._pointermove);
    eventManager.on('pointerup', this._pointerup);
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    this._lassoing = false;
    this._extent = null;

    const eventManager = this.context.map().renderer.events;
    eventManager.off('pointerdown', this._pointerdown);
    eventManager.off('pointermove', this._pointermove);
    eventManager.off('pointerup', this._pointerup);
  }


  /**
   * _pointerdown
   * Handler for pointerdown events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
   _pointerdown() {
    // Ignore it if we are not over the canvas
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
     const eventManager = this.context.map().renderer.events;
     if (!eventManager.pointerOverRenderer) return;

     const modifiers = eventManager.modifierKeys;
     const drawLasso = modifiers.has('Shift');

     if (drawLasso) {
       this._lassoing = true;
       const coord = this.context.map().mouseLoc();
       this._extent = new Extent(coord);
       this._coords.push(coord);
     }
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove() {
    if (!this._lassoing) return;

    const eventManager = this.context.map().renderer.events;
    if (!eventManager.pointerOverRenderer) return;

    const coord = this.context.map().mouseLoc();

    // Update geometry and extent
    this._extent = this._extent.extend(new Extent(coord));
    this._coords.push(coord);

    // Push the polygon data to the map UI for rendering.
    const mapUILayer = this.context.scene().layers.get('map-ui');
    mapUILayer.lassoPolygonData = this._coords;
    this.context.map().immediateRedraw();
  }


  /**
   * _pointerup
   * Handler for pointerup events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerup() {
    if (!this._lassoing) return;

    this._lassoing = false;
    const mapUILayer = this.context.scene().layers.get('map-ui');

    const ids = this._lassoed();
    this._coords = [];
    mapUILayer.lassoPolygonData = this._coords;

    this._extent = null;

    if (ids.length) {
      this.context.enter(modeSelect(this.context, ids));
    }
  }


  // After inverting the projection from screen coordintes to wgs84 coordinates
  // we need to fix min/max (in screen +y is down, in wgs84 +y is up)
  _normalize(a, b) {
    return [
      [ Math.min(a[0], b[0]), Math.min(a[1], b[1]) ],
      [ Math.max(a[0], b[0]), Math.max(a[1], b[1]) ]
    ];
  }


  _lassoed() {
    const graph = this.context.graph();
    const context = this.context;
    const polygonLocs = this._coords;

    if (!this.context.editable()) return [];

    let intersects = this.context.history()
      .intersects(this._extent)
      .filter(entity => {
        return (
          entity.type === 'node' &&
          geomPointInPolygon(entity.loc, polygonLocs) &&
          !context.features().isHidden(entity, graph, entity.geometry(graph)) &&
          !locationManager.blocksAt(entity.loc).length
        );
      });

    // sort the lassoed nodes as best we can  // bhousel - not sure why do this?
    intersects.sort(function(node1, node2) {
      const parents1 = graph.parentWays(node1);
      const parents2 = graph.parentWays(node2);

      if (parents1.length && parents2.length) {  // both nodes are vertices
        const sharedParents = utilArrayIntersection(parents1, parents2);

        // vertices are members of the same way; sort them in their listed order
        if (sharedParents.length) {
          const sharedParentNodes = sharedParents[0].nodes;
          return sharedParentNodes.indexOf(node1.id) - sharedParentNodes.indexOf(node2.id);

        // vertices do not share a way; group them by their respective parent ways
        } else {
          return parseFloat(parents1[0].id.slice(1)) - parseFloat(parents2[0].id.slice(1));
        }

      // only one node is a vertex; sort standalone points before vertices
      } else if (parents1.length || parents2.length) {
        return parents1.length - parents2.length;
      }

      // both nodes are standalone points; sort left to right
      return node1.loc[0] - node2.loc[0];
    });

    return intersects.map(entity => entity.id);
  }

}
