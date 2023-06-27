import { vecEqual } from '@rapid-sdk/math';

import { AbstractMode } from './AbstractMode';
import { actionAddEntity } from '../actions/add_entity';
import { actionAddMidpoint } from '../actions/add_midpoint';
import { actionAddVertex } from '../actions/add_vertex';
import { actionMoveNode } from '../actions/move_node';
import { actionNoop } from '../actions/noop';
import { geoChooseEdge } from '../geo';
import { osmNode, osmWay } from '../osm';

const DEBUG = false;


/**
 * `DrawLineMode`
 * In this mode we are drawing a new line or continuing an existing line
 */
export class DrawLineMode extends AbstractMode {

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
    this.firstNode = null;  // The first real node in the draw way
    this.lastNode = null;   // The last real node in the draw way (the draw node is after/before this one)

    // So for a draw way like
    // A -> B -> C -> D
    // A is the firstNode
    // C is the lastNode
    // D is the drawNode, temporary and will be popped off in exit()
    // A and C can be clicked on to finish the way

    // _insertIndex determines where new nodes get added (see `osmWay.addNode()`)
    // `0` = beginning, `undefined` = end
    this._insertIndex = undefined;
    this._startGraph = null;

    // Make sure the event handlers have `this` bound correctly
    this._move = this._move.bind(this);
    this._click = this._click.bind(this);
    this._finish = this._finish.bind(this);
    this._cancel = this._cancel.bind(this);
    this._undoOrRedo = this._undoOrRedo.bind(this);
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
        console.log(`DrawLineMode: entering, continuing line ${continueWay.id}`);  // eslint-disable-line no-console
      }

    } else {    // Start a new line
      if (DEBUG) {
        console.log('DrawLineMode: entering');  // eslint-disable-line no-console
      }
    }

    const context = this.context;
    this._active = true;

    this.drawWay = null;
    this.drawNode = null;
    this.lastNode = null;
    this.firstNode = null;

    this._insertIndex = undefined;
    this._startGraph = context.graph();
    this._selectedData.clear();

    context.enableBehaviors(['hover', 'draw', 'map-interaction', 'map-nudging']);

    context.behaviors.draw
      .on('move', this._move)
      .on('click', this._click)
      .on('finish', this._finish)
      .on('cancel', this._cancel);

    context.systems.edits
      .on('undone', this._undoOrRedo)
      .on('redone', this._undoOrRedo);

    context.behaviors['map-interaction'].doubleClickEnabled = false;


    // If we are continuing, perform initial actions to create the drawWay and drawNode..
    if (continueNode && continueWay) {
      const continueFromStart = (continueWay.affix(continueNode.id) === 'prefix');
      const oppositeNodeID = (continueFromStart ? continueWay.last() : continueWay.first());
      this._insertIndex = (continueFromStart ? 0 : undefined);
      this.lastNode = continueNode;
      this.firstNode = context.entity(oppositeNodeID);
      this.drawWay = continueWay;

      // Create draw node where we think the poitner is, and extend continue way to it
      this.drawNode = osmNode({ loc: context.systems.map.mouseLoc() });
      context.perform(
        actionAddEntity(this.drawNode),                                          // Create new draw node
        actionAddVertex(this.drawWay.id, this.drawNode.id, this._insertIndex)    // Add draw node to draw way
      );
      this._refreshEntities();
    }

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    if (DEBUG) {
      console.log('DrawLineMode: exiting');  // eslint-disable-line no-console
    }

    const context = this.context;
    context.pauseChangeDispatch();

    // If there is a temporary draw node, remove it.
    if (this.drawNode) {
      context.pop();
      if (this.drawWay) {
        this.drawWay = context.hasEntity(this.drawWay.id);  // Refresh draw way, so we can count its nodes
      }
    }

    // Confirm that the draw way exists and is valid..
    const length = this.drawWay?.nodes?.length || 0;
    if (length < 2) {
      if (DEBUG) {
        console.log('DrawLineMode: draw way invalid, rolling back');  // eslint-disable-line no-console
      }
      while (context.graph() !== this._startGraph) {  // rollback to initial state
        context.pop();
      }
    }

    this.drawWay = null;
    this.drawNode = null;
    this.lastNode = null;
    this.firstNode = null;
    this._insertIndex = undefined;
    this._selectedData.clear();
    context.scene().clearClass('drawing');

    window.setTimeout(() => {
      context.behaviors['map-interaction'].doubleClickEnabled = true;
    }, 1000);

    context.behaviors.draw
      .off('move', this._move)
      .off('click', this._click)
      .off('finish', this._finish)
      .off('cancel', this._cancel);

    context.systems.edits
      .off('undone', this._undoOrRedo)
      .off('redone', this._undoOrRedo);

    context.resumeChangeDispatch();
  }


  /**
   * _refreshEntities
   *  Gets the latest version of all the entities from the graph after any modifications
   *  Updates `selectedData` collection to include the draw way
   *  Updates `drawing` class for items that need it
   */
  _refreshEntities() {
    const context = this.context;
    const scene = context.scene();
    const graph = context.graph();

    this._selectedData.clear();
    scene.clearClass('drawing');

    this.drawWay = this.drawWay && graph.hasEntity(this.drawWay.id);
    this.drawNode = this.drawNode && graph.hasEntity(this.drawNode.id);
    this.lastNode = this.lastNode && graph.hasEntity(this.lastNode.id);
    this.firstNode = this.firstNode && graph.hasEntity(this.firstNode.id);

    // bail out if any of these are missing
    if (!this.drawWay || !this.drawNode || !this.lastNode || !this.firstNode) {
      this._cancel();
      return;
    }

    this._selectedData.set(this.drawWay.id, this.drawWay);

    scene.classData('osm', this.drawNode.id, 'drawing');

    // todo - we do want to allow connecting a line to itself in some situations
    scene.classData('osm', this.drawWay.id, 'drawing');
  }


  /**
   * _getAnnotation
   * An annotation is a text associated with the edit, such as "Started a line".
   * The edits on the history stack with annotations are the ones we can undo/redo back to.
   */
  _getAnnotation() {
    const length = this.drawWay?.nodes?.length || 0;
    if (length < 2) return undefined;

    const which = length > 2 ? 'continue' : 'start';
    return this.context.t(`operations.${which}.annotation.line`);
  }


  /**
   * _move
   * Move the draw node, if any.
   */
  _move(eventData) {
    if (!this.drawNode) return;

    const context = this.context;
    const graph = context.graph();
    const projection = context.projection;
    const coord = eventData.coord;
    let loc = projection.invert(coord);

    // Allow snapping only for OSM Entities in the actual graph (i.e. not Rapid features)
    const datum = eventData?.target?.data;
    const choice = eventData?.target?.choice;
    const target = datum && graph.hasEntity(datum.id);

    // Snap to a node
    if (target?.type === 'node') {
      loc = target.loc;

    // Snap to a way
//    } else if (target?.type === 'way' && choice) {
//      loc = choice.loc;
//    }
    } else if (target?.type === 'way') {
      const choice = geoChooseEdge(graph.childNodes(target), coord, projection, this.drawNode.id);
      const SNAP_DIST = 6;  // hack to avoid snap to fill, see #719
      if (choice && choice.distance < SNAP_DIST) {
        loc = choice.loc;
      }
    }

    context.replace(actionMoveNode(this.drawNode.id, loc));
    this.drawNode = context.entity(this.drawNode.id);  // refresh draw node
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

    const locationSystem = context.systems.locations;
    if (locationSystem.blocksAt(loc).length) return;   // editing is blocked here

    // Now that the user has clicked, let them nudge the map by moving to the edge.
    context.behaviors['map-nudging'].allow();

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
      const choice = geoChooseEdge(graph.childNodes(target), coord, projection, this.drawNode?.id);
      const SNAP_DIST = 6;  // hack to avoid snap to fill, see #719
      if (choice && choice.distance < SNAP_DIST) {
        const edge = [ target.nodes[choice.index - 1], target.nodes[choice.index] ];
        this._clickWay(choice.loc, edge);
        return;
      }
    }

    this._clickLoc(loc);
  }


  /**
   * _clickLoc
   * Clicked on nothing, create a point at given `loc`.
   */
  _clickLoc(loc) {
    const EPSILON = 1e-6;
    const context = this.context;
    context.pauseChangeDispatch();

    // Extend line by adding vertex at `loc`...
    if (this.drawWay) {
      // The drawNode is at the start or end node, try to finish the line.
      // (Normally this situation would be caught in `_clickNode`, maybe the user held down modifier key?)
      if (vecEqual(loc, this.lastNode.loc, EPSILON) || vecEqual(loc, this.firstNode.loc, EPSILON)) {
        this._finish();
        return;
      }

      if (DEBUG) {
        console.log(`DrawLineMode: _clickLoc, extending line to ${loc}`);  // eslint-disable-line no-console
      }

      context.replace(actionNoop(), this._getAnnotation());   // Add annotation so we can undo to here

      // Replace draw node
      this.lastNode = this.drawNode;
      this.drawNode = osmNode({ loc: loc });
      context.perform(
        actionAddEntity(this.drawNode),  // Create new draw node
        actionAddVertex(this.drawWay.id, this.drawNode.id, this._insertIndex)  // Add new draw node to draw way
      );

    // Start a new line at `loc`...
    } else {
      if (DEBUG) {
        console.log(`DrawLineMode: _clickLoc, starting line at ${loc}`);  // eslint-disable-line no-console
      }
      this.firstNode = osmNode({ loc: loc });
      this.lastNode = this.firstNode;
      this.drawNode = osmNode({ loc: loc });
      this.drawWay = osmWay({ tags: this.defaultTags, nodes: [ this.firstNode.id, this.drawNode.id ] });

      context.perform(
        actionAddEntity(this.firstNode),  // Create first node
        actionAddEntity(this.drawNode),   // Create new draw node (end)
        actionAddEntity(this.drawWay)     // Create new draw way
      );
    }

    this._refreshEntities();
    context.resumeChangeDispatch();
  }


  /**
   * _clickWay
   * Clicked on an target way, add a midpoint along the `edge` at given `loc`.
   */
  _clickWay(loc, edge) {
    const EPSILON = 1e-6;
    const context = this.context;
    const midpoint = { loc: loc, edge: edge };
    context.pauseChangeDispatch();

    // Extend line by adding vertex as midpoint along target edge...
    if (this.drawWay) {
      // The drawNode is at the start or end node, try to finish the line.
      // (Normally this situation would be caught in `_clickNode`, maybe the user held down modifier key?)
      if (vecEqual(loc, this.lastNode.loc, EPSILON) || vecEqual(loc, this.firstNode.loc, EPSILON)) {
        this._finish();
        return;
      }

      if (DEBUG) {
        console.log(`DrawLineMode: _clickWay, extending line to edge ${edge}`);  // eslint-disable-line no-console
      }

      context.replace(
        actionMoveNode(this.drawNode.id, loc),       // Finalize position of old draw node at `loc`
        actionAddMidpoint(midpoint, this.drawNode),  // Add old draw node as a midpoint on target edge
        this._getAnnotation()                        // Add annotation so we can undo to here
      );

      // Replace draw node
      this.lastNode = this.drawNode;
      this.drawNode = osmNode({ loc: loc });
      context.perform(
        actionAddEntity(this.drawNode),                                          // Create new draw node
        actionAddVertex(this.drawWay.id, this.drawNode.id, this._insertIndex)    // Add new draw node to draw way
      );

    // Start a new line at `loc` on target edge...
    } else {
      if (DEBUG) {
        console.log(`DrawLineMode: _clickWay, starting line at edge ${edge}`);  // eslint-disable-line no-console
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
      );
    }

    this._refreshEntities();
    context.resumeChangeDispatch();
  }


  /**
   * _clickNode
   * Clicked on a target node, include that node in the line we are drawing.
   */
  _clickNode(loc, targetNode) {
    const EPSILON = 1e-6;
    const context = this.context;
    context.pauseChangeDispatch();

    // Extend line by reusing target node as a vertex...
    // (Note that we don't need to replace the draw node in this scenario)
    if (this.drawWay) {
      // Clicked on first or last node, try to finish the line
      if (targetNode === this.lastNode || targetNode === this.firstNode ||
        vecEqual(loc, this.lastNode.loc, EPSILON) || vecEqual(loc, this.firstNode.loc, EPSILON)
      ) {
        if (targetNode === this.firstNode) {   // if clicked on first node, close the way
          context.replace(
            this._actionRemoveDrawNode(this.drawWay.id, this.drawNode),          // Remove the draw node, we dont need it
            actionAddVertex(this.drawWay.id, targetNode.id, this._insertIndex),  // Add target node to draw way
            this._getAnnotation()
          );
          this.drawNode = null;   // the draw node is removed, this prevents exit() from popping this edit we just did
        }

        this._finish();
        return;
      }

      if (DEBUG) {
        console.log(`DrawLineMode: _clickNode, extending line to ${targetNode.id}`);  // eslint-disable-line no-console
      }

      // Time for a switcheroo- replace the 'draw' node with the target node, and annotate it for undo/redo
      context.replace(
        this._actionRemoveDrawNode(this.drawWay.id, this.drawNode),           // Remove the draw node
        actionAddVertex(this.drawWay.id, targetNode.id, this._insertIndex),   // Add target node to draw way
        this._getAnnotation()
      );

      // Now put the draw node back where it was and continue drawing
      this.lastNode = targetNode;
      context.perform(
        actionAddEntity(this.drawNode),
        actionAddVertex(this.drawWay.id, this.drawNode.id, this._insertIndex)
      );

    // Start a new line at target node...
    } else {
      if (DEBUG) {
        console.log(`DrawLineMode: _clickNode, starting line at ${targetNode.id}`);  // eslint-disable-line no-console
      }

      this.firstNode = targetNode;
      this.lastNode = targetNode;
      this.drawNode = osmNode({ loc: loc });
      this.drawWay = osmWay({ tags: this.defaultTags, nodes: [ targetNode.id, this.drawNode.id ] });

      context.perform(
        actionAddEntity(this.drawNode),   // Create new draw node (end)
        actionAddEntity(this.drawWay),    // Create new draw way
      );
    }

    this._refreshEntities();
    context.resumeChangeDispatch();
  }


  /**
   * _actionRemoveDrawNode
   */
  _actionRemoveDrawNode(wayID, drawNode) {
    return function (graph) {
      return graph.replace(graph.entity(wayID).removeNode(drawNode.id)).remove(drawNode);
    };
  }


  /**
   * _finish
   * Done drawing, select the draw way or return to browse mode.
   * Note that `exit()` will be called immediately after this to perform cleanup.
   */
  _finish() {
    if (this.drawWay) {
      if (DEBUG) {
        console.log(`DrawLineMode: _finish, drawWay.id = ${this.drawWay.id}`);  // eslint-disable-line no-console
      }
      const context = this.context;
      context.enter('select-osm', { selectedIDs: [this.drawWay.id], newFeature: true });
    } else {
      this._cancel();
    }
  }


  /**
   * _cancel
   * Rollback to the initial graph then return to browse mode.
   * Note that `exit()` will be called immediately after this to perform cleanup.
   */
  _cancel() {
    if (DEBUG) {
      console.log(`DrawLineMode: _cancel`);  // eslint-disable-line no-console
    }
    this.drawWay = null;
    this.drawNode = null;
    this.firstNode = null;
    this.lastNode = null;
    this.context.enter('browse');
  }


  /**
   * _undoOrRedo
   * Try to restore a known state and continue drawing.
   * Return to browse mode if we can't do that.
   */
  _undoOrRedo() {
    this._cancel();
  }
}
