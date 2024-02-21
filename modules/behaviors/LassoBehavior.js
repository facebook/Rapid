import { Extent, geomPointInPolygon } from '@rapid-sdk/math';
import { utilArrayIntersection } from '@rapid-sdk/util';

import { AbstractBehavior } from './AbstractBehavior.js';


/**
 * `LassoBehavior` listens to pointer events and tries to
 *  create a lasso for selecting OSM features.
 *
 * If it's able to do this, it sends the lasso polygon data to the map ui layer
 * and on completeion enters select mode with the OSM features selected.
 */
export class LassoBehavior extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'lasso';

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

    const map = this.context.systems.map;
    const eventManager = map.renderer.events;
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

    const map = this.context.systems.map;
    const eventManager = map.renderer.events;
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
    const map = this.context.systems.map;
    const eventManager = map.renderer.events;
    if (!eventManager.pointerOverRenderer) return;

    const modifiers = eventManager.modifierKeys;
    const drawLasso = modifiers.has('Shift');

    if (drawLasso) {
      this._lassoing = true;
      const coord = map.mouseLoc();
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

    const map = this.context.systems.map;
    const eventManager = map.renderer.events;
    if (!eventManager.pointerOverRenderer) return;

    const coord = map.mouseLoc();

    // Update geometry and extent
    this._extent = this._extent.extend(new Extent(coord));
    this._coords.push(coord);

    // Push the polygon data to the map UI for rendering.
    const mapUILayer = map.scene.layers.get('map-ui');
    mapUILayer.lassoPolygonData = this._coords;
    map.immediateRedraw();
  }


  /**
   * _pointerup
   * Handler for pointerup events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerup() {
    if (!this._lassoing) return;

    this._lassoing = false;
    const map = this.context.systems.map;
    const mapUILayer = map.scene.layers.get('map-ui');

    const ids = this._lassoed();
    this._coords = [];
    mapUILayer.lassoPolygonData = this._coords;

    this._extent = null;

    if (ids.length) {
      this.context.enter('select-osm', { selection: { osm: ids }} );
    }
  }


  // After unprojecting from screen coordintes to wgs84 coordinates
  // we need to fix min/max (in screen +y is down, in wgs84 +y is up)
  _normalize(a, b) {
    return [
      [ Math.min(a[0], b[0]), Math.min(a[1], b[1]) ],
      [ Math.max(a[0], b[0]), Math.max(a[1], b[1]) ]
    ];
  }


  _lassoed() {
    const context = this.context;
    const editor = context.systems.editor;
    const locations = context.systems.locations;
    const filters = context.systems.filters;
    const graph = editor.staging.graph;

    if (!this.context.editable()) return [];

    const polygonLocs = this._coords;
    let intersects = editor
      .intersects(this._extent)
      .filter(entity => {
        return (
          entity.type === 'node' &&
          geomPointInPolygon(entity.loc, polygonLocs) &&
          !filters.isHidden(entity, graph, entity.geometry(graph)) &&
          !locations.blocksAt(entity.loc).length
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
