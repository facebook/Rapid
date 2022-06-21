import { AbstractMode } from './AbstractMode';

import { actionAddEntity } from '../actions/add_entity';
import { actionAddMidpoint } from '../actions/add_midpoint';
import { actionAddVertex } from '../actions/add_vertex';
import { modeDrawLine } from './draw_line';
import { osmNode, osmWay } from '../osm';
// import { prefs } from '../core/preferences';

const DEBUG = false;


/**
 * `ModeAddLine`
 * In this mode, we are waiting for the user to place the initial point of a line
 */
export class ModeAddLine extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared context for iD
   */
  constructor(context) {
    super(context);

    this.id = 'add-line';
    this.defaultTags = {};

    // Make sure the event handlers have `this` bound correctly
    this._start = this._start.bind(this);
    this._startFromWay = this._startFromWay.bind(this);
    this._startFromNode = this._startFromNode.bind(this);
    this._cancel = this._cancel.bind(this);
  }


  /**
   * enter
   */
  enter() {
    if (DEBUG) {
      console.log('ModeAddLine: entering');  // eslint-disable-line no-console
    }

    const context = this._context;
    this._active = true;

// figure out how this needs to happen - `this.defaultTags` maybe not ready yet?
//    // RapiD tagSources
//    const tagSources = prefs('rapid-internal-feature.tagSources') === 'true';
//    if (tagSources && this.defaultTags.highway) {
//      this.defaultTags.source = 'maxar';
//    }

    context.enableBehaviors(['hover', 'draw']);
    context.map().dblclickZoomEnable(false);
    context.behaviors.get('draw')
      .on('click', this._start)
      .on('clickWay', this._startFromWay)
      .on('clickNode', this._startFromNode)
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
      console.log('ModeAddLine: exiting');  // eslint-disable-line no-console
    }

    const context = this._context;
    this._active = false;

    window.setTimeout(() => context.map().dblclickZoomEnable(true), 1000);

    context.behaviors.get('draw')
      .on('click', null)
      .on('clickWay', null)
      .on('clickNode', null)
      .on('cancel', null)
      .on('finish', null);
  }


  /**
   * _start
   * Clicked on nothing, create the point at given `loc` and start line from there
   */
  _start(loc) {
    const context = this._context;
    const startGraph = context.graph();
    const node = osmNode({ loc: loc });
    const way = osmWay({ tags: this.defaultTags });

    context.perform(
      actionAddEntity(node),
      actionAddEntity(way),
      actionAddVertex(way.id, node.id)
    );

    context.enter(modeDrawLine(context, way.id, startGraph, 'line'));
  }


  /**
   * _startFromWay
   * Clicked on an existing way, add a midpoint along the `edge` at given `loc` and start line from there
   */
  _startFromWay(loc, edge) {
    const context = this._context;
    const startGraph = context.graph();
    const node = osmNode({ loc: loc });
    const way = osmWay({ tags: this.defaultTags });

    context.perform(
      actionAddEntity(node),
      actionAddEntity(way),
      actionAddVertex(way.id, node.id),
      actionAddMidpoint({ loc: loc, edge: edge }, node)
    );

    context.enter(modeDrawLine(context, way.id, startGraph, 'line'));
  }


  /**
   * _startFromNode
   * Clicked on an existing node, start new line from there.
   */
  _startFromNode(loc, node) {
    const context = this._context;
    const startGraph = context.graph();
    const way = osmWay({ tags: this.defaultTags });

    context.perform(
      actionAddEntity(way),
      actionAddVertex(way.id, node.id)
    );

    context.enter(modeDrawLine(context, way.id, startGraph, 'line'));
  }


  /**
   * _cancel
   * Return to browse mode immediately, `exit()` will handle cleanup
   */
  _cancel() {
    this._context.enter('browse');
  }

}
