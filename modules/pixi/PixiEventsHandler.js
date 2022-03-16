import { GlowFilter } from '@pixi/filter-glow';

import { modeBrowse, modeSelect, modeRapidSelectFeatures } from '../modes';
import { actionMoveNode } from '../actions/move_node';
import { actionNoop } from '../actions/noop';
import { t } from '../core/localizer';


/**
 * PixiEventsHandler contains event handlers for the various events/gestures
 * that the user does while interacting with the map.
 * It contains properties like which entity/entities are currently selected,
 * whether we are in the middle of a map pan gesture, etc.
 *
 * It will also put us into the correct mode depending on what is being interacted with.
 *
 * @class
 */
export class PixiEventsHandler {

  /**
   * @constructor
   */
  constructor(context, dispatch, projection, scene) {
    // Suppress the native context menu from appearing on the canvas
    let supersurface = context.container().select('div.supersurface');
    supersurface.on('contextmenu', (e) => { e.preventDefault(); });

    this.context = context;
    this.dispatch = dispatch;
    this.projection = projection;
    this.scene = scene;

    this._hoverTarget = null;
    this._draggingState = false;
    this._selectedObjects = [];
    this._draggingEntity = null;

    const stage = context.pixi.stage;
    stage
      .on('click', e => this.onClickHandler(e))
      .on('tap', e => this.onClickHandler(e))
      .on('rightdown', e => this.onClickHandler(e))
      .on('pointermove', e => this.onPointerMoveHandler(e));
      // .on('pointerdown', e => this.onTouchStartHandler(e))
      // .on('pointermove', e => this.onTouchMoveHandler(e))
      // .on('pointerup', e => this.onTouchEndHandler(e));
  }


  /**
   * onRightClickHandler
   *
   * @param e - a PIXI.Event
   */
  onRightClickHandler(e) {
    const target = getTarget(e);
    if (!target) return;

    const dObj = target.obj;
    // const entity = target.data;

    const name = dObj.name || 'nothing';
    console.log(`right clicked on ${name}`);

    const currentPosition = { x: e.data.global.x, y: e.data.global.y };
    this.context.ui().showEditMenu([currentPosition.x, currentPosition.y], 'rightclick');
  }


  /**
   * onClickHandler
   *
   * When a click is registered, we need to figure out:
   * 1) What got clicked on: a map feature, or the background stage hitArea?
   * 2) If a map feature, was it a rapid feature, OSM feature, etc...
   *
   * @param e - a PIXI.Event
   */
  onClickHandler(e) {
    this.context.ui().closeEditMenu();

    const target = getTarget(e);
    if (!target) return;

    const dObj = target.obj;
    const entity = target.data;

    const name = dObj.name || 'nothing';
    console.log(`clicked on ${name}`);

    // reset filters
    this._selectedObjects.forEach(dObj => dObj.filters = []);
    this._selectedObjects = [];

    if (entity) {
      if (entity.__fbid__) {    // clicked a RapiD feature ..
        this.context
          .selectedNoteID(null)
          .selectedErrorID(null)
          .enter(modeRapidSelectFeatures(this.context, entity));
      } else {
        this.context.enter(modeSelect(this.context, [entity.id]));
      }

      dObj.filters = [ new GlowFilter({ distance: 15, outerStrength: 2, color: 0xff26db }) ];
      this._selectedObjects.push(dObj);

      // Now process right-click!
      if (e.data.button === 2) {
        this.onRightClickHandler(e);
      }
    } else {
      this.context.enter(modeBrowse(this.context));
    }

    this.dispatch.call('change');
  }


  /**
   * onPointerMoveHandler
   *
   * @param e - a PIXI.Event
   */
  onPointerMoveHandler(e) {
    const target = getTarget(e);
    if (!target) return;

    const dObj = target.obj;
    // const entity = target.data;

    // hover target has changed
    if (dObj !== this._hoverTarget) {
      const name = dObj.name || 'nothing';
      console.log(`pointer over ${name}`);
      this._hoverTarget = dObj;
    }
  }


  /**
   * onTouchStartHandler
   *
   * @param e - a PIXI.Event
   */
  onTouchStartHandler(e) {
    const target = getTarget(e);
    if (!target) return;

    this.touchContainer = target.obj;
    const entity = target.data;
    if (!entity) return;

    function isPoint(entity) {
      return entity.type === 'node' && entity.geometry(this.context.graph()) === 'point';
    }

    if (this.isPoint(entity)) {
      this.touchPosition = { x: e.data.global.x, y: e.data.global.y };
      this._draggingEntity = entity;
      this.dispatch.call('dragstart');
      this.context.perform(actionNoop());
    }
  }


  /**
   * onTouchMoveHandler
   *
   * @param e - a PIXI.Event
   */
  onTouchMoveHandler(e) {
    if (!e.target) return;

    if (this._draggingEntity) {
      this._draggingState = true;
      const currentPosition = { x: e.data.global.x, y: e.data.global.y };
      const stageOffset = this.context.pixi.stage.position;
      const offsetX = currentPosition.x - this.touchPosition.x;
      const offsetY = currentPosition.y - this.touchPosition.y;
      let newXCoord = this.touchPosition.x + offsetX - stageOffset.x;
      let newYCoord = this.touchPosition.y + offsetY - stageOffset.y;
      // movingContainer.y = this.touchPosition.y + offsetY - stageOffset.y;
      this.touchPosition.x = this.touchPosition.x + offsetX;
      this.touchPosition.y = this.touchPosition.y + offsetY;
      let dest = this.projection.invert([newXCoord, newYCoord]);

      let feature = this.scene.get(this._draggingEntity.id);
      this.context.replace(actionMoveNode(feature.id, dest));
      feature.dirty = true;
      this.dispatch.call('change');
    }
  }


  /**
   * onTouchMoveHandler
   *
   * @param e - a PIXI.Event
   */
  onTouchEndHandler(e) {
    function moveAnnotation(entity) {
      return t('operations.move.annotation.' + entity.geometry(this.context.graph()));
    }

    if (this._draggingState) {
      this.dispatch.call('dragend');
      const currentPosition = { x: e.data.global.x, y: e.data.global.y };
      const stageOffset = this.context.pixi.stage.position;
      let newXCoord = currentPosition.x  - stageOffset.x;
      let newYCoord = currentPosition.y - stageOffset.y;
      let dest = this.projection.invert([newXCoord, newYCoord]);
      let feature = this.scene.get(this._draggingEntity.id);
      feature.dirty = true;
      this.context.replace(
        actionMoveNode(feature.id, dest),
        this.moveAnnotation(this._draggingEntity)
      );
      this.dispatch.call('change');
    }
    this._draggingState = false;
    this._draggingEntity = null;
    this.touchPosition = null;
  }


  /**
   * selectedObjects is a list of the entities that are currently clicked.
   */
  get selectedObjects() {
    return this._selectedObjects;
  }
}



/**
 * getTarget
 * returns the target displayobject and data to use for this event
 *
 * @param e - a PIXI.Event
 */
function getTarget(e) {
  if (!e.target) return null;

  let obj = e.target;
  let data = obj && obj.__data__;

  // Data is here, use this target
  if (data) {
    return { obj: obj, data: data };
  }

  // No data in target, look in parent
  obj = e.target.parent;
  data = obj && obj.__data__;
  if (data) {
    return { obj: obj, data: data };
  }

  // No data there either, just use the original target
  return { obj: e.target, data: null };
}
