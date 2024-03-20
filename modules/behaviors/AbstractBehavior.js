import { EventEmitter } from '@pixi/utils';
import { vecRotate } from '@rapid-sdk/math';


/**
 * "Behaviors" are nothing more than bundles of event handlers that we can
 * enable and disable depending on what the user is doing.
 *
 * `AbstractBehavior` is the base class from which all behaviors inherit.
 * It contains enable/disable methods which manage the event handlers for the behavior.
 * All behaviors are event emitters.
 *
 * Properties you can access:
 *   `id`        `String` identifier for the behavior (e.g. 'draw')
 *   `enabled`   `true` if the event handlers are enabled, `false` if not.
 */
export class AbstractBehavior extends EventEmitter {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super();
    this.context = context;
    this.id = '';

    this._enabled = false;
  }


  /**
   * enable
   * Every behavior should have an `enable` function
   * to setup whatever event handlers this behavior needs
   */
  enable() {
    if (this._enabled) return;
    this._enabled = true;
  }


  /**
   * disable
   * Every behavior should have a `disable` function
   * to teardown whatever event handlers this behavior needs
   */
  disable() {
    if (!this._enabled) return;
    this._enabled = false;
  }


  /**
   * enabled
   * Whether the behavior is enabled
   * @readonly
   */
  get enabled() {
    return this._enabled;
  }

//  /**
//   * _getEventCoord
//   * Returns an [x,y] coordinate of interest for the supplied event.
//   * This can get pretty hairy given the touch and mouse event interactions have different formats.
//   */
//  _getEventCoord(e) {
//    let coord;
//    const oe = e.data.originalEvent;
//    if (oe.offsetX !== undefined) {
//      coord = [oe.offsetX, oe.offsetY];    // mouse coords
//    } else if (oe.layerX !== undefined) {
//      coord = [oe.layerX, oe.layerY];      // ipad coords, seemingly?
//    } else if (oe.touches && oe.touches[0]) {
//      coord = [oe.touches[0].clientX, oe.touches[0].clientY];   // initial touch
//    } else {
//      coord = [oe.changedTouches.clientX, oe.changedTouches.clientY];   // updated touch
//    }
//
//    return coord;
//  }
//

  /**
   * _getEventData
   * Returns an object containing the important details about this Pixi event.
   * @param  {Object}  e - A Pixi FederatedEvent (or something that looks like one)
   * @return {Object}  Object containing data about the event and what was targeted
   */
  _getEventData(e) {
//    const result = {
//      //      pointer event id                touch event id        default
//      id: e.data.originalEvent.pointerId || e.data.pointerType || 'mouse',
//      event: e,
//      originalEvent: e.data.originalEvent,
//      // mouse original events contain offsets, touch events contain 'layerX/Y'.
//      coord: this._getEventCoord(e),
//      time: e.data.originalEvent.timeStamp,
//      isCancelled: false,
//      target: null,
//      feature: null,
//      data: null,
//    };

    const coord = {
      screen: [e.global.x, e.global.y],  // [0,0] is top,left of the screen
      map: [e.global.x, e.global.y]      // [0,0] is the origin of the viewport (rotation removed)
    };

    const context = this.context;
    const viewport = context.viewport;
    const r = viewport.transform.r;
    if (r) {
      coord.map = vecRotate(coord.screen, -r, viewport.center());  // remove rotation
    }

    const result = {
      id: e.pointerId ?? e.pointerType ?? 'unknown',
      event: e,
      originalEvent: e.originalEvent,
      coord: coord,
      time: e.timeStamp,
      isCancelled: false,
      target: null
    };

    if (!e.target) {   // `e.target` is the Pixi DisplayObject that triggered this event.
      return result;
    }

    let dObj = e.target;
    let feature = dObj?.__feature__;

    // __feature__ is here, use this target
    if (feature) {
      result.target = {
        displayObject: dObj,
        feature: feature,
        featureID: feature.id,
        layer: feature.layer,
        layerID: feature.layer.id,
        data: feature.data,
        dataID: feature.dataID
      };
      return result;
    }

    // No __feature__ in target, look in parent
    dObj = e.target.parent;
    feature = dObj?.__feature__;
    if (feature) {
      result.target = {
        displayObject: dObj,
        feature: feature,
        featureID: feature.id,
        layer: feature.layer,
        layerID: feature.layer.id,
        data: feature.data,
        dataID: feature.dataID
      };
      return result;
    }

    // No __feature__ there either, just use the original target
    result.target = {
      displayObject: e.target,
      feature: null,
      featureID: null,
      layer: null,
      layerID: null,
      data: null,
      dataID: null
    };
    return result;
  }

}
