import { polygonHull as d3_polygonHull, polygonCentroid as d3_polygonCentroid } from 'd3-polygon';
import { DEG2RAD, vecInterp, vecSubtract } from '@rapid-sdk/math';
import { utilGetAllNodes } from '@rapid-sdk/util';

import { AbstractMode } from './AbstractMode.js';
import { actionRotate } from '../actions/rotate.js';


/**
 * `RotateMode`
 * In this mode, we are rotating one or more map features
 */
export class RotateMode extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'rotate';

    this._entityIDs = [];
    this._lastPoint = null;
    this._pivotLoc = null;

    // Make sure the event handlers have `this` bound correctly
    this._cancel = this._cancel.bind(this);
    this._finish = this._finish.bind(this);
    this._keydown = this._keydown.bind(this);
    this._pointermove = this._pointermove.bind(this);
  }


  /**
   * enter
   * Enters the mode.
   * @param  {Object?}  options - Optional `Object` of options passed to the new mode
   * @param  {Object}   options.selection - An object where the keys are layerIDs
   *    and the values are Arrays of dataIDs:  Example:  `{ 'osm': ['w1', 'w2', 'w3'] }`
   * @return {boolean}  `true` if the mode can be entered, `false` if not
   */
  enter(options = {}) {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const filters = context.systems.filters;
    const locations = context.systems.locations;
    const map = context.systems.map;
    const eventManager = map.renderer.events;

    const selection = options.selection ?? {};
    let entityIDs = selection.osm ?? [];

    // Gather valid entities and entityIDs from selection.
    // For this mode, keep only the OSM data.
    this._selectedData = new Map();

    for (const entityID of entityIDs) {
      const entity = graph.hasEntity(entityID);
      if (!entity) continue;   // not in the osm graph
      if (entity.type === 'node' && locations.blocksAt(entity.loc).length) continue;  // editing is blocked

      this._selectedData.set(entityID, entity);
    }

    if (!this._selectedData.size) return false;  // nothing to select

    this._entityIDs = [...this._selectedData.keys()];  // the ones we ended up keeping
    this._active = true;

    filters.forceVisible(this._entityIDs);
    context.enableBehaviors(['mapInteraction']);

    this._lastPoint = null;
    this._pivotLoc = this._calcPivotLoc();

    eventManager
      .on('click', this._finish)
      .on('keydown', this._keydown)
      .on('pointercancel', this._cancel)
      .on('pointermove', this._pointermove);

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    const context = this.context;
    const editor = context.systems.editor;
    const filters = context.systems.filters;
    const l10n = context.systems.l10n;
    const eventManager = context.systems.map.renderer.events;

    this._lastPoint = null;
    this._pivotLoc = null;

    filters.forceVisible([]);

    eventManager
      .off('click', this._finish)
      .off('keydown', this._keydown)
      .off('pointercancel', this._cancel)
      .off('pointermove', this._pointermove);

    // If there is work in progress, finalize it.
    if (editor.hasWorkInProgress) {
      const graph = editor.staging.graph;
      const annotation = (this._entityIDs.length === 1) ?
        l10n.t('operations.rotate.annotation.' + graph.geometry(this._entityIDs[0])) :
        l10n.t('operations.rotate.annotation.feature', { n: this._entityIDs.length });

      editor.commit({
        annotation: annotation,
        selectedIDs: this._entityIDs
      });
    }
  }


  /**
   * _keydown
   * Handler for keydown events on the window.
   * @param  `e`  A DOM KeyboardEvent
   */
  _keydown(e) {
    if (['Enter'].includes(e.key)) {
      e.preventDefault();
      this._finish();

    } else if (['Backspace', 'Delete', 'Del', 'Escape', 'Esc'].includes(e.key)) {
      e.preventDefault();
      this._cancel();

    } else if (['m', 'M'].includes(e.key)) {
      e.preventDefault();
      this.context.enter('move', { selection: { osm: this._entityIDs }} );
    }
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove() {
    const context = this.context;
    const editor = context.systems.editor;
    const eventManager = context.systems.map.renderer.events;
    const currPoint = eventManager.coord.map;

    // Some notes!
    // There are 2 approaches to converting user's pointer movement into a rotation.
    //
    // The "old" code calcuated the angle between the pointer and the pivot.
    // This worked great when the pointer was close to the pivot, but not all all when
    // the pointer was far from the pivot (as the angles would not change much).
    // This would be intuitive to use if there is a rotation handle for the user to grab.
    // However - we don't have that!  Users enter rotation mode either by pressing the
    // 'R' key, or by selecting the option from the edit menu.
    // The pointer is often not near the pivot at all.
    //
    // The "new" code converts +/- pointer movements into +/- rotations linearly.
    // This means that even if you are far from the pivot, moving the pointer
    // left/right or up/down, should spin the shape in a mostly intuitive way.
    //
    // We can keep the old code around in case people dislike "new" rotation, or if
    // we ever build a transforming tool with a rotation handle that the user can grab.

    // "new" - determine pointer movement dx,dy but relative to the pivot point
    if (this._lastPoint) {
      const pivotPoint = context.viewport.project(this._pivotLoc);
      const [dX, dY] = vecSubtract(currPoint, this._lastPoint);   // delta pointer movement
      const [sX, sY] = [                                          // swap signs if needed
        (currPoint[0] > pivotPoint[0]) ? 1 : -1,   // right/left of pivot
        (currPoint[1] > pivotPoint[1]) ? -1 : 1    // above/below pivot
      ];
      const degrees = (sY * dX) + (sX * dY);   // Degrees rotation to apply: + clockwise, - counterclockwise
      const SPEED = 0.3;
      const angle = degrees * DEG2RAD * SPEED;
      editor.perform(actionRotate(this._entityIDs, pivotPoint, angle, context.viewport));
    }
    this._lastPoint = currPoint.slice();  // copy

    // "old" - rotational
    // const pivotPoint = context.viewport.project(this._pivotLoc);
    // const currAngle = Math.atan2(currPoint[1] - pivotPoint[1], currPoint[0] - pivotPoint[0]);
    // if (this._lastAngle !== null) {
    //   const angle = currAngle - this._lastAngle;
    //   editor.perform(actionRotate(entityIDs, pivotPoint, angle, context.viewport));
    // }
    // this._lastAngle = currAngle;


    // Update selected/active collections to contain the current moved entities
    this._selectedData.clear();
    const currGraph = editor.staging.graph;
    for (const entityID of this._entityIDs) {
      this._selectedData.set(entityID, currGraph.entity(entityID));
    }
  }


  /**
   * _calcPivotLoc
   * Calculate the [lon,lat] location that the features should pivot around
   * @return  Array [lon,lat]
   */
  _calcPivotLoc() {
    const context = this.context;
    const viewport = context.viewport;
    const graph = context.systems.editor.staging.graph;
    const nodes = utilGetAllNodes(this._entityIDs, graph);
    const points = nodes.map(node => viewport.project(node.loc));

    // Calculate in projected coordinates [x,y]
    let centroid;
    if (points.length === 1) {
      centroid = points[0];
    } else if (points.length === 2) {
      centroid = vecInterp(points[0], points[1], 0.5);
    } else {
      const polygonHull = d3_polygonHull(points);
      if (polygonHull.length === 2) {
        centroid = vecInterp(points[0], points[1], 0.5);
      } else {
        centroid = d3_polygonCentroid(d3_polygonHull(points));
      }
    }

    // Return spherical coordinates [lon,lat]
    // (if viewport changes later, we just reproject instead of recalculating)
    return viewport.unproject(centroid);
  }


  /**
   * _finish
   * Return to select mode - `exit()` will finalize the work in progress.
   */
  _finish() {
    this.context.enter('select-osm', { selection: { osm: this._entityIDs }} );
  }


  /**
   * _cancel
   * Return to select mode without doing anything
   */
  _cancel() {
    const context = this.context;
    const editor = context.systems.editor;

    editor.revert();
    context.enter('select-osm', { selection: { osm: this._entityIDs }} );
  }

}

