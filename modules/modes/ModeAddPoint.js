import { AbstractMode } from './AbstractMode';

import { t } from '../core/localizer';
import { modeSelect } from './select';
import { osmNode } from '../osm/node';
import { actionAddEntity } from '../actions/add_entity';
import { actionChangeTags } from '../actions/change_tags';
import { actionAddMidpoint } from '../actions/add_midpoint';

const DEBUG = false;


/**
 * `ModeAddPoint`
 */
export class ModeAddPoint extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared context for iD
   */
  constructor(context) {
    super(context);

    this.id = 'add-point';
    this.defaultTags = {};

    // Make sure the event handlers have `this` bound correctly
    this._click = this._click.bind(this);
    this._clickWay = this._clickWay.bind(this);
    this._clickNode = this._clickNode.bind(this);
    this._cancel = this._cancel.bind(this);
  }


  /**
   * enter
   */
  enter() {
    if (DEBUG) {
      console.log('ModeAddPoint: entering');  // eslint-disable-line no-console
    }

    this._active = true;
    this._context.enableBehaviors(['hover', 'draw']);
    this._context.behaviors.get('draw')
      .on('click', this._click)
      .on('clickWay', this._clickWay)
      .on('clickNode', this._clickNode)
      .on('cancel', this._cancel)
      .on('finish', this._cancel);

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;

    if (DEBUG) {
      console.log('ModeAddPoint: exiting');  // eslint-disable-line no-console
    }

    this._active = false;
    this._context.behaviors.get('draw')
      .on('click', null)
      .on('clickWay', null)
      .on('clickNode', null)
      .on('cancel', null)
      .on('finish', null);
  }


  /**
   * _click
   * Clicked on nothing, create the point at given `loc`
   */
  _click(loc) {
    const node = osmNode({ loc: loc, tags: this.defaultTags });
    const annotation = t('operations.add.annotation.point');
    this._context.perform(actionAddEntity(node), annotation);
    this._context.enter(modeSelect(this._context, [node.id]).newFeature(true));
  }


  /**
   * _clickWay
   * Clicked on an existing way, add a midpoint along the `edge` at given `loc`
   */
  _clickWay(loc, edge) {
    const node = osmNode({ tags: this.defaultTags });
    const annotation = t('operations.add.annotation.vertex');
    this._context.perform(actionAddMidpoint({ loc: loc, edge: edge }, node), annotation);
    this._context.enter(modeSelect(this._context, [node.id]).newFeature(true));
  }


  /**
   * _clickNode
   * Clicked on an existing node, merge `defaultTags` into it, if any, then select the node
   */
  _clickNode(loc, node) {
    if (Object.keys(this.defaultTags).length === 0) {
      this._context.enter(modeSelect(this._context, [node.id]));
      return;
    }

    let tags = Object.assign({}, node.tags);  // shallow copy
    for (const k in this.defaultTags) {
      tags[k] = this.defaultTags[k];
    }

    const annotation = t('operations.add.annotation.point');
    this._context.perform(actionChangeTags(node.id, tags), annotation);
    this._context.enter(modeSelect(this._context, [node.id]).newFeature(true));
  }


  /**
   * _cancel
   * Return to browse mode without doing anything
   */
  _cancel() {
    this._context.enter('browse');
  }

}
