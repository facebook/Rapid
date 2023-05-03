import { AbstractMode } from './AbstractMode';

import { actionAddEntity } from '../actions/add_entity';
import { actionChangeTags } from '../actions/change_tags';
import { actionAddMidpoint } from '../actions/add_midpoint';
import { geoChooseEdge } from '../geo';
import { modeSelect } from '../modes/select';
import { osmNode } from '../osm/node';
import { t } from '../core/localizer';

const DEBUG = false;


/**
 * `ModeAddPoint`
 * In this mode, we are waiting for the user to place a point somewhere
 */
export class ModeAddPoint extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);

    this.id = 'add-point';
    this.defaultTags = {};

    // Make sure the event handlers have `this` bound correctly
    this._click = this._click.bind(this);
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
    const context = this.context;
    context.enableBehaviors(['hover', 'draw', 'map-interaction']);

    context.behaviors.get('draw')
      .on('click', this._click)
      .on('cancel', this._cancel)
      .on('finish', this._cancel);

    context.history().on('undone.ModeAddPoint redone.ModeAddPoint', this._cancel);

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

    const context = this.context;
    context.behaviors.get('draw')
      .off('click', this._click)
      .off('cancel', this._cancel)
      .off('finish', this._cancel);

    context.history().on('undone.ModeAddPoint redone.ModeAddPoint', null);
  }


  /**
   * _click
   * Process whatever the user clicked on
   */
  _click(eventData) {
    const context = this.context;
    const graph = context.graph();
    const projection = context.projection;
    const coord = eventData.coord;
    const loc = projection.invert(coord);

    const locationSystem = context.locationSystem();
    if (locationSystem.blocksAt(loc).length) return;   // editing is blocked here

    // Allow snapping only for OSM Entities in the actual graph (i.e. not Rapid features)
    const datum = eventData?.target?.data;
    const choice = eventData?.target?.choice;
    const target = datum && graph.hasEntity(datum.id);

    // Snap to a node
    if (target?.type === 'node') {
      this._clickNode(target.loc, target);
      return;
    }

    // Snap to a way
//    if (target?.type === 'way' && choice) {
//      const edge = [ target.nodes[choice.index - 1], target.nodes[choice.index] ];
//      this._clickWay(choice.loc, edge);
//      return;
//    }
    if (target?.type === 'way') {
      const choice = geoChooseEdge(graph.childNodes(target), coord, projection);
      const SNAP_DIST = 6;  // hack to avoid snap to fill, see #719
      if (choice && choice.distance < SNAP_DIST) {
        const edge = [target.nodes[choice.index - 1], target.nodes[choice.index]];
        this._clickWay(choice.loc, edge);
        return;
      }
    }

    this._clickNothing(loc);
  }


  /**
   * _click
   * Clicked on nothing, create the point at given `loc`
   */
  _clickNothing(loc) {
    const context = this.context;
    const node = osmNode({ loc: loc, tags: this.defaultTags });
    const annotation = t('operations.add.annotation.point');
    context.perform(actionAddEntity(node), annotation);
    context.enter(modeSelect(context, [node.id]).newFeature(true));
  }


  /**
   * _clickWay
   * Clicked on an existing way, add a midpoint along the `edge` at given `loc`
   */
  _clickWay(loc, edge) {
    const context = this.context;
    const node = osmNode({ tags: this.defaultTags });
    const annotation = t('operations.add.annotation.vertex');
    context.perform(actionAddMidpoint({ loc: loc, edge: edge }, node), annotation);
    context.enter(modeSelect(context, [node.id]).newFeature(true));
  }


  /**
   * _clickNode
   * Clicked on an existing node, merge `defaultTags` into it, if any, then select the node
   */
  _clickNode(loc, node) {
    const context = this.context;

    if (Object.keys(this.defaultTags).length === 0) {
      context.enter(modeSelect(context, [node.id]));
      return;
    }

    let tags = Object.assign({}, node.tags);  // shallow copy
    for (const k in this.defaultTags) {
      tags[k] = this.defaultTags[k];
    }

    const annotation = t('operations.add.annotation.point');
    context.perform(actionChangeTags(node.id, tags), annotation);
    context.enter(modeSelect(context, [node.id]).newFeature(true));
  }


  /**
   * _cancel
   * Return to browse mode without doing anything
   */
  _cancel() {
    this.context.enter('browse');
  }

}
