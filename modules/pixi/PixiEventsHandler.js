import { select as d3_select } from 'd3-selection';
import { GlowFilter } from '@pixi/filter-glow';

import { modeBrowse, modeSelect } from '../modes';
import { modeRapidSelectFeatures } from '../modes/rapid_select_features';
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
   * @param displayObject - root Pixi display object for the feature
   *    (can be a Graphic, Container, Sprite, etc)
   */
  constructor(context, dispatch, projection, scene) {

    // Suppress the native context menu from appearing on the canvas
    let supersurface = context.container().select('div.supersurface');
    supersurface.on('contextmenu', (e) => { e.preventDefault(); });

    this.context = context;
    this.dispatch = dispatch;
    this.projection = projection;
    this.scene = scene;
    this.draggingState = false;
    this._selectedEntities = [];
    this.draggingEntity = null;
  }

    /**
   * onRightClickHandler
   *
   *
   *
   * @param e - a PIXI.Event
   */
  onRightClickHandler(e) {
        if (!e.target) return;
        const name = e.target.name || 'nothing';
        console.log(`right clicked on ${name}`);
        const entity = e.target.__data__;
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
   *
   * @param e - a PIXI.Event
   */
  onClickHandler(e) {
  this.context.map().supersurface
            .select('.edit-menu').remove();

        if (!e.target) return;
        const name = e.target.name || 'nothing';
        console.log(`clicked on ${name}`);
    const entity = e.target.__data__;
     this._selectedEntities.forEach(entity => entity.filters = []);
     this._selectedEntities = [];
        if (entity) {
            if (entity.__fbid__) {    // clicked a RapiD feature ..
              this.context
                  .selectedNoteID(null)
                  .selectedErrorID(null)
                .enter(modeRapidSelectFeatures(this.context, entity));
            } else {

                this.context.enter(modeSelect(this.context, [entity.id]));
            }
                e.target.filters = [new GlowFilter({ distance: 15, outerStrength: 2, color: 0xff26db })];
                this._selectedEntities.push(e.target);
          //Now process right-click!
          if (e.data.button === 2) {
            this.onRightClickHandler(e);
          }
        } else {
            this.context.enter(modeBrowse(this.context));
        }
        this.dispatch.call('change');

    }

  onPointerMoveHandler(e) {

    if (!e.target) return;

    // hover target has changed
    if (e.target !== this._hoverTarget) {
      const name = e.target.name || 'nothing';
      console.log(`pointer over ${name}`);

      //          // remove hover
      //          if (this._hoverTarget) {
      //            const hover = this._hoverTarget.getChildByName('hover');
      //            if (hover) hover.destroy();
      //          }

      this._hoverTarget = e.target;

      //          // add new hover
      //          if (e.target !== stage) {
      //            const hover = new PIXI.Sprite(PIXI.Texture.WHITE);
      //            hover.name = 'hover';
      //            hover.width= 50;
      //            hover.height= 50;
      //            hover.interactive = false;
      //            hover.interactiveChildren = false;
      //            e.target.addChild(hover);
      //          }

      //          this.render();
    }
  }

    isPoint(entity) {
      return entity.type === 'node' && entity.geometry(this.context.graph()) === 'point';
    }

  onTouchStartHandler(e) {
    const name = e.target.name || 'nothing';
    this.touchContainer = e.target;
    const entity = e.target.__data__;

    if (!entity) return;

    if (this.isPoint(entity)) {

      this.touchPosition = { x: e.data.global.x, y: e.data.global.y };
      this.draggingState = true;
      this.draggingEntity = entity;
      this.dispatch.call('dragstart');
      this.context.perform(actionNoop());
    }

  }

  onTouchMoveHandler(e) {
    if (!this.draggingState || !e.target) return;

    if (this.draggingEntity) {
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

      let feature = this.scene.get(this.draggingEntity.id);
      this.context.replace(
        actionMoveNode(feature.id, dest)
      );
      feature.dirty = true;
      this.dispatch.call('change');
    }
  }


    moveAnnotation(entity) {
        return t('operations.move.annotation.' + entity.geometry(this.context.graph()));
    }

  onTouchEndHandler(e) {

    if (this.draggingState) {
     this.dispatch.call('dragend');
      const currentPosition = { x: e.data.global.x, y: e.data.global.y };
      const stageOffset = this.context.pixi.stage.position;
      let newXCoord = this.touchPosition.x  - stageOffset.x;
      let newYCoord = this.touchPosition.y - stageOffset.y;
      let dest = this.projection.invert([newXCoord, newYCoord]);
      let feature = this.scene.get(this.draggingEntity.id);

      this.context.replace(
        actionMoveNode(feature.id, dest),
        this.moveAnnotation(this.draggingEntity)
        );
    }
    this.draggingState = false;
    this.draggingEntity = null;


    this.dispatch.call('change');
  }

  /**
   * selectedEntities is a list of the entities that are currently clicked.
   */
  get selectedEntities() {
    return this._selectedEntities;
  }
}
