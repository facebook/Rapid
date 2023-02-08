import { AbstractMode } from './AbstractMode';

import { actionAddEntity } from '../actions/add_entity';
import { actionChangeTags } from '../actions/change_tags';
import { actionAddMidpoint } from '../actions/add_midpoint';
import { geoChooseEdge } from '../geo';
import { locationManager } from '../core/LocationManager';
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
    this.context.enableBehaviors(['hover', 'draw', 'map-interaction']);
    this.context.behaviors.get('draw')
      .on('click', this._click)
      .on('cancel', this._cancel)
      .on('undo', this._cancel)
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
    this.context.behaviors.get('draw')
      .off('click', this._click)
      .off('cancel', this._cancel)
      .off('undo', this._cancel)
      .off('finish', this._cancel);
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

    if (locationManager.blocksAt(loc).length) return;   // editing is blocked here

    // Allow snapping only for OSM Entities in the actual graph (i.e. not RapiD features)
    const target = eventData.target;
    const datum = target && target.data;
    const entity = datum && graph.hasEntity(datum.id);

    // Snap to a node
    if (entity && entity.type === 'node') {
      this._clickNode(entity.loc, entity);
      return;
    }

    // Snap to a way
    if (entity && entity.type === 'way') {
      const activeIDs = context.activeIDs();
      const activeID = activeIDs.length ? activeIDs[0] : undefined;  // get the first one, if any
      const choice = geoChooseEdge(graph.childNodes(entity), coord, projection, activeID);
const SNAP_DIST = 6;  // hack to avoid snap to fill, see #719
if (choice && choice.distance < SNAP_DIST) {
        const edge = [entity.nodes[choice.index - 1], entity.nodes[choice.index]];
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
    const node = osmNode({ loc: loc, tags: this.defaultTags });
    const annotation = t('operations.add.annotation.point');
    this.context.perform(actionAddEntity(node), annotation);
    this.context.enter(modeSelect(this.context, [node.id]).newFeature(true));
  }


  /**
   * _clickWay
   * Clicked on an existing way, add a midpoint along the `edge` at given `loc`
   */
  _clickWay(loc, edge) {
    const node = osmNode({ tags: this.defaultTags });
    const annotation = t('operations.add.annotation.vertex');
    this.context.perform(actionAddMidpoint({ loc: loc, edge: edge }, node), annotation);
    this.context.enter(modeSelect(this.context, [node.id]).newFeature(true));
  }


  /**
   * _clickNode
   * Clicked on an existing node, merge `defaultTags` into it, if any, then select the node
   */
  _clickNode(loc, node) {
    if (Object.keys(this.defaultTags).length === 0) {
      this.context.enter(modeSelect(this.context, [node.id]));
      return;
    }

    let tags = Object.assign({}, node.tags);  // shallow copy
    for (const k in this.defaultTags) {
      tags[k] = this.defaultTags[k];
    }

    const annotation = t('operations.add.annotation.point');
    this.context.perform(actionChangeTags(node.id, tags), annotation);
    this.context.enter(modeSelect(this.context, [node.id]).newFeature(true));
  }


  /**
   * _cancel
   * Return to browse mode without doing anything
   */
  _cancel() {
    this.context.enter('browse');
  }

}
