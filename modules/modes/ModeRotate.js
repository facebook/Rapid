import { polygonHull as d3_polygonHull, polygonCentroid as d3_polygonCentroid } from 'd3-polygon';
import { vecInterp, vecSubtract } from '@id-sdk/math';
import { utilGetAllNodes } from '@id-sdk/util';

import { AbstractMode } from './AbstractMode';
import { actionRotate } from '../actions/rotate';
import { actionNoop } from '../actions/noop';
import { modeSelect } from './select';
import { t } from '../core/localizer';


/**
 * `ModeRotate`
 * In this mode, we are rotating one or more map features
 */
export class ModeRotate extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);

    this.id = 'rotate';
    this._entityIDs = [];
    this._prevGraph = null;
    this._lastPoint = null;
    this._pivotLoc = null;

    // Make sure the event handlers have `this` bound correctly
    this._cancel = this._cancel.bind(this);
    this._finish = this._finish.bind(this);
    this._keydown = this._keydown.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._undone = this._undone.bind(this);
  }


  /**
   * enter
   * Expects a `selection` property in the options argument as a `Map(datumID -> datum)`
   * @param  `options`  Optional `Object` of options passed to the new mode
   */
  enter(options = {}) {
    const selection = options.selection;
    if (!(selection instanceof Map)) return false;
    if (!selection.size) return false;
    this._entityIDs = [...selection.keys()];

    this._active = true;

    const context = this.context;
    context.features().forceVisible(this._entityIDs);
    context.enableBehaviors(['map-interaction']);

    this._prevGraph = null;
    this._lastPoint = null;
    this._pivotLoc = null;

    const eventManager = context.map().renderer.events;
    eventManager.on('click', this._finish);
    eventManager.on('keydown', this._keydown);
    eventManager.on('pointercancel', this._cancel);
    eventManager.on('pointermove', this._pointermove);
    context.history().on('undone.modeMove', this._undone);

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    this._prevGraph = null;
    this._lastPoint = null;
    this._pivotLoc = null;

    const context = this.context;
    context.features().forceVisible([]);

    const eventManager = this.context.map().renderer.events;
    eventManager.off('click', this._finish);
    eventManager.off('keydown', this._keydown);
    eventManager.off('pointercancel', this._cancel);
    eventManager.off('pointermove', this._pointermove);
    context.history().on('undone.modeMove', null);
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
    }
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove() {
    const context = this.context;
    const eventManager = context.map().renderer.events;
    const currPoint = eventManager.coord;

    let fn;
    // If prevGraph doesn't match, either we haven't started rotating, or something has
    // occurred during the rotate that interrupted it, so reset pivot and start a new rotation
    if (this._prevGraph !== context.graph()) {
      this._pivotLoc = this._calcPivotLoc();
      fn = context.perform;   // start a rotation
    } else {
      fn = context.replace;   // continue rotating
    }

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
      const pivotPoint = context.projection.project(this._pivotLoc);
      const [dX, dY] = vecSubtract(currPoint, this._lastPoint);   // delta pointer movement
      const [sX, sY] = [                                          // swap signs if needed
        (currPoint[0] > pivotPoint[0]) ? 1 : -1,   // right/left of pivot
        (currPoint[1] > pivotPoint[1]) ? -1 : 1    // above/below pivot
      ];
      const degrees = (sY * dX) + (sX * dY);   // Degrees rotation to apply: + clockwise, - counterclockwise
      const SPEED = 0.3;
      const angle = degrees * (Math.PI / 180) * SPEED;
      fn(actionRotate(this._entityIDs, pivotPoint, angle, context.projection));
      this._prevGraph = context.graph();
    }
    this._lastPoint = currPoint.slice();  // copy

    // "old" - rotational
    // const pivotPoint = context.projection.project(this._pivotLoc);
    // const currAngle = Math.atan2(currPoint[1] - pivotPoint[1], currPoint[0] - pivotPoint[0]);
    // if (this._lastAngle !== null) {
    //   const angle = currAngle - this._lastAngle;
    //   fn(actionRotate(entityIDs, pivotPoint, angle, context.projection));
    //   this._prevGraph = context.graph();
    // }
    // this._lastAngle = currAngle;


    // Update selected/active collections to contain the moved entities
    this._selectedData.clear();
    this._activeData.clear();
    for (const entityID of this._entityIDs) {
      this._selectedData.set(entityID, context.entity(entityID));
      this._activeData.set(entityID, context.entity(entityID));
    }
  }


  /**
   * _calcPivotLoc
   * Calculate the [lon,lat] location that the features should pivot around
   * @return  Array [lon,lat]
   */
  _calcPivotLoc() {
    const projection = this.context.projection;
    const nodes = utilGetAllNodes(this._entityIDs, this.context.graph());
    const points = nodes.map(node => projection.project(node.loc));

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
    // (if projection changes later, we just reproject instead of recalculating)
    return projection.invert(centroid);
  }


  /**
   * _finish
   * Finalize the move edit
   */
  _finish() {
    const context = this.context;
    if (this._prevGraph) {
      const annotation = (this._entityIDs.length === 1) ?
        t('operations.rotate.annotation.' + context.graph().geometry(this._entityIDs[0])) :
        t('operations.rotate.annotation.feature', { n: this._entityIDs.length });

      context.replace(actionNoop(), annotation);   // annotate the rotation
    }
    context.enter(modeSelect(context, this._entityIDs));
  }


  /**
   * _cancel
   * Return to select mode without doing anything
   */
  _cancel() {
    const context = this.context;
    if (this._prevGraph) {
      context.pop();   // remove the rotate
    }
    context.enter(modeSelect(context, this._entityIDs));
  }


  /**
   * _undone
   * Return to browse mode without doing anything
   */
  _undone() {
    this.context.enter('browse');
  }
}

