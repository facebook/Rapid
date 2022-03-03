import { modeBrowse, modeSelect } from '../modes';
import { modeRapidSelectFeatures } from '../modes/rapid_select_features';
import {GlowFilter} from '@pixi/filter-glow';

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
  constructor(context, dispatch, projection, featureCache) {
    this.context = context;
    this.dispatch = dispatch;
    this.projection = projection;
    this.featureCache = featureCache;
    this.draggingState = false;
    this._selectedEntities = [];
    this.draggingEntity = null;
    this.draggingTarget = null;
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
        if (!e.target) return;
        const name = e.target.name || 'nothing';
        console.log(`clicked on ${name}`);
        const entity = e.target.__data__;
        if (entity) {
            if (entity.__fbid__) {    // clicked a RapiD feature ..
              this.context
                  .selectedNoteID(null)
                  .selectedErrorID(null)
                .enter(modeRapidSelectFeatures(this.context, entity));
            } else {
                this._selectedEntities.forEach(entity => entity.filters = []);
                this._selectedEntities = [];
                this.context.enter(modeSelect(this.context, [entity.id]));
                e.target.filters = [new GlowFilter({ distance: 15, outerStrength: 2, color: 0xff26db })];
                this._selectedEntities.push(e.target);
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
    console.log(`point: touch started on ${name}, pos: ${e.target.x},${e.target.y}`);
      this.touchPosition = { x: e.data.global.x , y: e.data.global.y};
      this.draggingState = true;
      this.draggingEntity = entity;
      this.draggingTarget = e.target;
      this.dispatch.call('dragstart');
    }

  }

  onTouchMoveHandler(e) {
    if (!this.draggingState || !e.target) return;

    if (this.draggingEntity) {
      const movingContainer = this.draggingTarget;
      const currentPosition = { x: e.data.global.x, y: e.data.global.y };
      const offsetX = currentPosition.x - this.touchPosition.x;
      const offsetY = currentPosition.y - this.touchPosition.y;
      // console.log(`currentPosition: [${currentPosition.x},${currentPosition.y}]`);
      // console.log(`[+x, +y]: [${offsetX},${offsetY}]`);
      // movingContainer.x = movingContainer.x + offsetX;
      // movingContainer.y = movingContainer.y + offsetY;
      movingContainer.x = this.touchPosition.x + offsetX;
      movingContainer.y = this.touchPosition.y + offsetY;
      console.log(`New position: ${movingContainer.x}, ${movingContainer.y}`);
      this.touchPosition.x = movingContainer.x;
      this.touchPosition.y = movingContainer.y;
      let dest = this.projection.invert([this.touchPosition.x, this.touchPosition.y]);

      let feature = this.featureCache.get(this.draggingEntity.id);
      feature.coord = dest;
      feature.update(this.projection);
      this.dispatch.call('change');
    }
  }

  onTouchEndHandler(e) {
    console.log('Points touch end');
    this.draggingState = false;
    this.draggingEntity = null;
    this.draggingTarget = null;
    this.dispatch.call('dragend');
    this.dispatch.call('change');
  }

  /**
   * selectedEntities is a list of the entities that are currently clicked.
   */
  get selectedEntities() {
    return this._selectedEntities;
  }
}