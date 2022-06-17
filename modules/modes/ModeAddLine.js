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
  }


  /**
   * enter
   */
  enter() {
    if (DEBUG) {
      console.log('ModeAddLine: entering');  // eslint-disable-line no-console
    }

    this._active = true;
    this._context.enableBehaviors(['hover', 'add-way']);

    this._context.behaviors.get('add-way')
      .on('start', this._start)
      .on('startFromWay', this._startFromWay)
      .on('startFromNode', this._startFromNode);

// figure out how this needs to happen - `this.defaultTags` maybe not ready yet?
//    // RapiD tagSources
//    const tagSources = prefs('rapid-internal-feature.tagSources') === 'true';
//    if (tagSources && this.defaultTags.highway) {
//      this.defaultTags.source = 'maxar';
//    }
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

    this._active = false;
    this._context.behaviors.get('add-way')
      .on('start', null)
      .on('startFromWay', null)
      .on('startFromNode', null);
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

}
