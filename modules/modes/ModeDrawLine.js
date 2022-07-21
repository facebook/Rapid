import { AbstractMode } from './AbstractMode';

import { actionAddEntity } from '../actions/add_entity';
import { actionAddMidpoint } from '../actions/add_midpoint';
import { actionAddVertex } from '../actions/add_vertex';
import { actionDeleteNode } from '../actions/delete_node';
import { actionMoveNode } from '../actions/move_node';
import { actionNoop } from '../actions/noop';
import { modeSelect } from '../modes/select';
import { osmNode, osmWay } from '../osm';
import { t } from '../core/localizer';
// import { prefs } from '../core/preferences';

const DEBUG = false;


/**
 * `ModeDrawLine`
 * In this mode we are drawing a new line or continuing an existing line
 */
export class ModeDrawLine extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);

    this.id = 'draw-line';
    this.defaultTags = {};

    this.drawWay = null;    // The draw way just contains the way that we are drawing
    this.drawNode = null;   // The draw node is temporary and just follows the pointer
    this.lastNode = null;   // The last real node in the draw way
    this.firstNode = null;  // The first real node in the draw way

    // _insertIndex determines where new nodes get added (see `osmWay.addNode()`)
    // `0` = beginning, `undefined` = end
    this._insertIndex = undefined;

    // Make sure the event handlers have `this` bound correctly
    this._move = this._move.bind(this);
    this._click = this._click.bind(this);
    this._clickWay = this._clickWay.bind(this);
    this._clickNode = this._clickNode.bind(this);
    this._cancel = this._cancel.bind(this);
    this._finish = this._finish.bind(this);
  }


  /**
   * enter
   * Draw a new line, or optionally continue an existing line.
   * To continue a line, the `options` argument must contain
   * `continueNode` and `continueWay` properties
   *
   * @param  `options`  Optional `Object` of options passed to the new mode
   */
  enter(options = {}) {
    const continueNode = options.continueNode;
    const continueWay = options.continueWay;

    // If either parameter is present, make sure they are both valid
    if (continueNode || continueWay) {
      if (!(continueNode instanceof osmNode)) return false;
      if (!(continueWay instanceof osmWay)) return false;

      if (DEBUG) {
        console.log(`ModeDrawLine: entering, continuing line ${continueWay.id}`);  // eslint-disable-line no-console
      }

    } else {    // Start a new line
      if (DEBUG) {
        console.log('ModeDrawLine: entering');  // eslint-disable-line no-console
      }
    }

    const context = this.context;
    this._active = true;

    this.drawWay = null;
    this.drawNode = null;
    this.lastNode = null;
    this.firstNode = null;
    this._insertIndex = undefined;
    this._selectedData.clear();

    context.history().checkpoint('draw-line-initial');  // save history checkpoint to return to if things go bad

    if (continueNode && continueWay) {
      const continueFromStart = (continueWay.affix(continueNode.id) === 'prefix');
      const oppositeNodeID = (continueFromStart ? continueWay.last() : continueWay.first());
      this._insertIndex = (continueFromStart ? 0 : undefined);
      this.lastNode = continueNode;
      this.firstNode = context.entity(oppositeNodeID);
      this.drawWay = continueWay;
      this._selectedData.set(this.drawWay.id, this.drawWay);
      this._continueFromNode(continueNode);  // create draw node and extend continue way to it
    }

    context.map().dblclickZoomEnable(false);
    context.enableBehaviors([/*'hover',*/ 'draw']);
    context.behaviors.get('draw')
      .on('move', this._move)
      .on('click', this._click)
      .on('clickWay', this._clickWay)
      .on('clickNode', this._clickNode)
      .on('cancel', this._cancel)
      .on('finish', this._finish);

// figure out how this needs to happen - `this.defaultTags` maybe not ready yet?
// maybe pass defaultTags in `options` now?
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
      console.log('ModeDrawLine: exiting');  // eslint-disable-line no-console
    }

    const context = this.context;
    this._active = false;

    // If there is a temporary draw node, remove it.
    if (this.drawNode) {
      context.replace(actionDeleteNode(this.drawNode.id));
    }

    // Confirm that the drawn way exists and is valid..
    if (!this._drawWayValid()) {
      if (DEBUG) {
        console.log('ModeDrawLine: draw way invalid, rolling back');  // eslint-disable-line no-console
      }
      context.history().reset('draw-line-initial');   // rollback to checkpoint
    }

    this.drawWay = null;
    this.drawNode = null;
    this.lastNode = null;
    this.firstNode = null;
    this._insertIndex = undefined;
    this._selectedData.clear();

    window.setTimeout(() => context.map().dblclickZoomEnable(true), 1000);

    context.behaviors.get('draw')
      .off('move', this._move)
      .off('click', this._click)
      .off('clickWay', this._clickWay)
      .off('clickNode', this._clickNode)
      .off('cancel', this._cancel)
      .off('finish', this._finish);
  }


  /**
   * _drawWayValid
   * True if the draw way is valid, false if not
   */
  _drawWayValid() {
    if (!this.drawWay) return false;
    if (this.drawWay.isDegenerate()) return false;
    return true;
  }



  /**
   * _getAnnotation
   * An annotation is a text associated with the edit, such as "Started a line".
   * The edits on the history stack with annotations are the ones we can undo/redo back to.
   */
  _getAnnotation() {
    if (!this._drawWayValid()) return undefined;

    const which = this.drawWay ? 'continue' : 'start';
    return t(`operations.${which}.annotation.line`);
  }


  /**
   * _move
   * Move the draw node, if any.
   */
  _move(eventData) {
    if (!this.drawWay) return;

    const context = this.context;
    const loc = context.projection.invert(eventData.coord);

    if (DEBUG) {
      console.log(`ModeDrawLine: _move, moving draw node to ${loc}`);  // eslint-disable-line no-console
    }

//snap
// todo- we should get what we need from the eventData, not redo that logic here
//    var targetLoc = datum && datum.properties && datum.properties.entity &&
//        allowsVertex(datum.properties.entity) && datum.properties.entity.loc;
//    var targetNodes = datum && datum.properties && datum.properties.nodes;
//
//    if (targetLoc) {   // snap to node/vertex - a point target with `.loc`
//        loc = targetLoc;
//
//    } else if (targetNodes) {   // snap to way - a line target with `.nodes`
//        var choice = geoChooseEdge(targetNodes, context.map().mouse(), context.projection, drawNode.id);
//        if (choice) {
//            loc = choice.loc;
//        }
//    }

    context.replace(
      actionMoveNode(this.drawNode.id, loc),
      this._getAnnotation()
    );
    this.drawNode = context.entity(this.drawNode.id);
    this._activeData.set(this.drawNode.id, this.drawNode);
  }


  /**
   * _click
   * Clicked on nothing, create a point at given `loc`.
   */
  _click(loc) {
    const context = this.context;

    // Extend line by adding vertex at `loc`...
    if (this.drawWay) {
      // The drawNode is at the start or end node, try to finish the line.
      // (Normally this situation would be caught in `_clickNode`, maybe the user held down Alt key?)
      if (this.drawNode.loc === this.lastNode.loc || this.drawNode.loc === this.firstNode.loc) {
        this._finish();
        return;
      }

      if (DEBUG) {
        console.log(`ModeDrawLine: _click, extending line to ${loc}`);  // eslint-disable-line no-console
      }

      // Replace draw node
      this.lastNode = this.drawNode;
      this.drawNode = osmNode({ loc: loc });

      context.replace(
        actionMoveNode(this.lastNode.id, loc),   // Finalize position of old draw node at `loc`
        this._getAnnotation()
      );
      context.perform(
        actionAddEntity(this.drawNode),                                         // Create new draw node
        actionAddVertex(this.drawWay.id, this.drawNode.id, this._insertIndex),  // Add new draw node to draw way
        this._getAnnotation()
      );


    // Start a new line at `loc`...
    } else {
      if (DEBUG) {
        console.log(`ModeDrawLine: _click, starting line at ${loc}`);  // eslint-disable-line no-console
      }
      this.firstNode = osmNode({ loc: loc });
      this.lastNode = this.firstNode;
      this.drawNode = osmNode({ loc: loc });
      this.drawWay = osmWay({ tags: this.defaultTags, nodes: [ this.firstNode.id, this.drawNode.id ] });

      context.perform(
        actionAddEntity(this.firstNode),  // Create first node
        actionAddEntity(this.drawNode),   // Create new draw node (end)
        actionAddEntity(this.drawWay)     // Create new draw way
        // Skip annotation, this is not a valid way yet
      );
    }

    this.drawWay = context.entity(this.drawWay.id);        // Refresh draw way
    this._selectedData.set(this.drawWay.id, this.drawWay);
    this._activeData.set(this.drawNode.id, this.drawNode);

    // Perform a no-op edit that will be replaced as the user moves the draw node around.
    context.perform(actionNoop());
  }


  /**
   * _clickWay
   * Clicked on an target way, add a midpoint along the `edge` at given `loc`.
   */
  _clickWay(loc, edge) {
    const context = this.context;
    const midpoint = { loc: loc, edge: edge };

    // Extend line by adding vertex at midpoint on target edge...
    if (this.drawWay) {
      // The drawNode is at the start or end node, try to finish the line.
      // (Normally this situation would be caught in `_clickNode`, maybe the user held down Alt key?)
      if (this.drawNode.loc === this.lastNode.loc || this.drawNode.loc === this.firstNode.loc) {
        this._finish();
        return;
      }

      if (DEBUG) {
        console.log(`ModeDrawLine: _clickWay, extending line to edge ${edge}`);  // eslint-disable-line no-console
      }

      // Replace draw node
      this.lastNode = this.drawNode;
      this.drawNode = osmNode({ loc: loc });

      context.replace(
        actionMoveNode(this.lastNode.id, loc),       // Finalize position of old draw node at `loc`
        actionAddMidpoint(midpoint, this.lastNode),  // Add old draw node as a midpoint on target edge
        this._getAnnotation()
      );
      context.perform(
        actionAddEntity(this.drawNode),                                          // Create new draw node
        actionAddVertex(this.drawWay.id, this.drawNode.id, this._insertIndex),   // Add new draw node to draw way
        this._getAnnotation()
      );


    // Start a new line at `loc` on target edge...
    } else {
      if (DEBUG) {
        console.log(`ModeDrawLine: _clickWay, starting line at edge ${edge}`);  // eslint-disable-line no-console
      }
      this.firstNode = osmNode({ loc: loc });
      this.lastNode = this.firstNode;
      this.drawNode = osmNode({ loc: loc });
      this.drawWay = osmWay({ tags: this.defaultTags, nodes: [ this.firstNode.id, this.drawNode.id ] });

      context.perform(
        actionAddEntity(this.firstNode),              // Create first node
        actionAddEntity(this.drawNode),               // Create new draw node (end)
        actionAddEntity(this.drawWay),                // Create new draw way
        actionAddMidpoint(midpoint, this.firstNode)   // Add first node as midpoint on target edge
        // Skip annotation, this is not a valid way yet
      );
    }

    this.drawWay = context.entity(this.drawWay.id);        // Refresh draw way
    this._selectedData.set(this.drawWay.id, this.drawWay);
    this._activeData.set(this.drawNode.id, this.drawNode);

    // Perform a no-op edit that will be replaced as the user moves the draw node around.
    context.perform(actionNoop());
  }


  /**
   * _clickNode
   * Clicked on a target node, include that node in the line we are drawing.
   */
  _clickNode(loc, targetNode) {
    const context = this.context;

    // Extend line by reuse target node as a vertex...
    // (Note that we don't need to replace the draw node in this scenerio)
    if (this.drawWay) {
      // Clicked on the first or last node, try to finish the line
      if (this.targetNode === this.lastNode || this.targetNode === this.firstNode) {
        this._finish();
        return;
      }

      if (DEBUG) {
        console.log(`ModeDrawLine: _clickNode, extending line to ${targetNode.id}`);  // eslint-disable-line no-console
      }

      this.lastNode = targetNode;

      // The target node needs to be inserted "before" the draw node
      // If draw node is at the beginning, insert target 1 after beginning.
      // If draw node is at the end, insert target 1 before the end.
      const targetIndex = this.drawWay.affix(this.drawNode.id) === 'prefix' ? 1 : this.drawWay.nodes.length - 2;

      context.replace(
        actionAddVertex(this.drawWay.id, targetNode.id, targetIndex),   // Add target node to draw way
        this._getAnnotation()
      );


    // Start a new line at target node...
    } else {
      if (DEBUG) {
        console.log(`ModeDrawLine: _clickNode, starting line at ${targetNode.id}`);  // eslint-disable-line no-console
      }

      this.firstNode = targetNode;
      this.lastNode = targetNode;
      this.drawNode = osmNode({ loc: loc });
      this.drawWay = osmWay({ tags: this.defaultTags, nodes: [ targetNode.id, this.drawNode.id ] });

      context.perform(
        actionAddEntity(this.drawNode),   // Create new draw node (end)
        actionAddEntity(this.drawWay)     // Create new draw way
        // skip annotation, this is not a valid way yet
      );
    }

    this.drawWay = context.entity(this.drawWay.id);        // Refresh draw way
    this._selectedData.set(this.drawWay.id, this.drawWay);
    this._activeData.set(this.drawNode.id, this.drawNode);

    // Perform a no-op edit that will be replaced as the user moves the draw node around.
    context.perform(actionNoop());
  }


  /**
   * _continueFromNode
   * We're entering this mode with the target node and draw way already selected
   * i.e. Continuing from the start or end of an existing way
   */
  _continueFromNode(targetNode) {
    const context = this.context;

    if (DEBUG) {
      console.log(`ModeDrawLine: _continueFromNode, continuing line at ${targetNode.id}`);  // eslint-disable-line no-console
    }

    this.drawNode = osmNode({ loc: targetNode.loc });

    context.perform(
      actionAddEntity(this.drawNode),                                          // Create new draw node
      actionAddVertex(this.drawWay.id, this.drawNode.id, this._insertIndex),   // Add draw node to draw way
      this._getAnnotation()
    );

    this.drawWay = context.entity(this.drawWay.id);        // Refresh draw way
    this._selectedData.set(this.drawWay.id, this.drawWay);
    this._activeData.set(this.drawNode.id, this.drawNode);

    // Perform a no-op edit that will be replaced as the user moves the draw node around.
    context.perform(actionNoop());
  }


  /**
   * _finish
   * Done drawing, select the draw way or return to browse mode.
   * Note that `exit()` will be called immediately after this to perform cleanup.
   */
  _finish() {
    const context = this.context;

    if (this.drawWay) {
      if (DEBUG) {
        console.log(`ModeDrawLine: _finish, drawWay = ${this.drawWay.id}`);  // eslint-disable-line no-console
      }
      context.enter(modeSelect(context, [this.drawWay.id]));  //.newFeature(isNewFeature));

    } else {
      if (DEBUG) {
        console.log(`ModeDrawLine: _finish, no drawWay`);  // eslint-disable-line no-console
      }
      context.enter('browse');
    }
  }


  /**
   * _cancel
   * Rollback to the initial checkpoint then return to browse mode
   * Note that `exit()` will be called immediately after this to perform cleanup.
   */
  _cancel() {
    if (DEBUG) {
      console.log(`ModeDrawLine: _cancel`);  // eslint-disable-line no-console
    }
    this.drawWay = null;   // this will trigger a rollback
    this.context.enter('browse');
  }

}
