import { vecEqual } from '@rapid-sdk/math';

import { AbstractMode } from './AbstractMode';
import { actionAddEntity } from '../actions/add_entity';
import { actionAddMidpoint } from '../actions/add_midpoint';
import { actionAddVertex } from '../actions/add_vertex';
import { actionMoveNode } from '../actions/move_node';
import { geoChooseEdge } from '../geo';
import { osmNode, osmWay } from '../osm';

const DEBUG = false;


/**
 * `DrawAreaMode`
 * In this mode, we are waiting for the user to place the initial point of an area
 */
export class DrawAreaMode extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'draw-area';

    this.defaultTags = {};
    this.drawWay = null;    // The draw way just contains the way that we are drawing
    this.drawNode = null;   // The draw node is temporary and just follows the pointer
    this.firstNode = null;  // The first real node in the draw way (this is also the last node that closes the area)
    this.lastNode = null;   // The last real node in the draw way (technically it's the node before the draw node)

    // So for a closed draw way like:
    // A -> B -> C -> D -> A
    // A is the firstNode
    // C is the lastNode
    // D is the drawNode, temporary and will be popped off in exit()
    // A and C can be clicked on to finish the way

    // Make sure the event handlers have `this` bound correctly
    this._move = this._move.bind(this);
    this._click = this._click.bind(this);
    this._finish = this._finish.bind(this);
    this._cancel = this._cancel.bind(this);
    this._undoOrRedo = this._undoOrRedo.bind(this);
  }


  /**
   * enter
   * Enters the mode.
   */
  enter() {
    if (DEBUG) {
      console.log('DrawAreaMode: entering'); // eslint-disable-line no-console
    }

    const context = this.context;
    const editor = context.systems.editor;

    this._active = true;
    this.defaultTags = { area: 'yes' };
    this.drawWay = null;
    this.drawNode = null;
    this.lastNode = null;
    this.firstNode = null;

    this._selectedData.clear();

    context.enableBehaviors(['hover', 'draw', 'map-interaction', 'map-nudging']);

    context.behaviors.draw
      .on('move', this._move)
      .on('click', this._click)
      .on('finish', this._finish)
      .on('cancel', this._cancel);

    editor
      .on('undone', this._undoOrRedo)
      .on('redone', this._undoOrRedo);

    context.behaviors['map-interaction'].doubleClickEnabled = false;

    editor.setCheckpoint('beginDraw');

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    if (DEBUG) {
      console.log('DrawAreaMode: exiting'); // eslint-disable-line no-console
    }

    const context = this.context;
    const editor = context.systems.editor;
    const scene = context.systems.map.scene;

    editor.beginTransaction();

    // If there is a temporary draw node, remove it.
    editor.rollback();
//    if (this.drawNode) {
//      editor.pop();
//      if (this.drawWay) {
//        this.drawWay = editor.current.graph.hasEntity(this.drawWay.id);  // Refresh draw way, so we can count its nodes
//      }
//    }

    // Confirm that the draw way exists and is valid..
    const length = this.drawWay?.nodes?.length || 0;
    if (length < 4) {
      if (DEBUG) {
        console.log('DrawAreaMode: draw way invalid, rolling back');  // eslint-disable-line no-console
      }
//      while (editor.current.graph !== this._startGraph) {  // rollback to initial state
//        editor.pop();
//      }
      editor.restoreCheckpoint('beginDraw');
    }

    this.drawWay = null;
    this.drawNode = null;
    this.lastNode = null;
    this.firstNode = null;
    this._selectedData.clear();
    scene.clearClass('drawing');

    window.setTimeout(() => {
      context.behaviors['map-interaction'].doubleClickEnabled = true;
    }, 1000);

    context.behaviors.draw
      .off('move', this._move)
      .off('click', this._click)
      .off('finish', this._finish)
      .off('cancel', this._cancel);

    editor
      .off('undone', this._undoOrRedo)
      .off('redone', this._undoOrRedo);

    editor.endTransaction();
  }


  /**
   * _refreshEntities
   *  Gets updated versions of all the entities from the current graph after any modifications
   *  Updates `selectedData` collection to include the draw way
   *  Updates `drawing` class for items that need it
   */
  _refreshEntities() {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.current.graph;
    const scene = context.systems.map.scene;

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

    scene.classData('osm', this.drawWay.id, 'drawing');
    scene.classData('osm', this.drawNode.id, 'drawing');
  }


  /**
   * _getAnnotation
   * An annotation is a text associated with the edit, such as "Started an area".
   * The edits on the history stack with annotations are the ones we can undo/redo back to.
   */
  _getAnnotation() {
    const length = this.drawWay?.nodes?.length || 0;
    if (length < 4) return undefined;

    const which = length > 4 ? 'continue' : 'start';
    const l10n = this.context.systems.l10n;
    return l10n.t(`operations.${which}.annotation.area`);
  }


  /**
   * _move
   * Move the draw node, if any.
   */
  _move(eventData) {
    if (!this.drawNode) return;

    const context = this.context;
    const editor = context.systems.editor;
    const projection = context.projection;
    const coord = eventData.coord;
    let graph = editor.current.graph;
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
    } else if (target && target.type === 'way') {
      const choice = geoChooseEdge(graph.childNodes(target), coord, projection, this.drawNode.id);
      const SNAP_DIST = 6;  // hack to avoid snap to fill, see #719
      if (choice && choice.distance < SNAP_DIST) {
        loc = choice.loc;
      }
    }

    editor.perform(actionMoveNode(this.drawNode.id, loc));
    graph = editor.current.graph;   // post-action
    this.drawNode = graph.entity(this.drawNode.id);  // refresh draw node
  }


  /**
   * _click
   * Process whatever the user clicked on.
   */
  _click(eventData) {
    const context = this.context;
    const editor = context.systems.editor;
    const locations = context.systems.locations;
    const graph = editor.current.graph;
    const projection = context.projection;
    const coord = eventData.coord;

    const loc = projection.invert(coord);
    if (locations.blocksAt(loc).length) return;   // editing is blocked here

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
   * Clicked on nothing, created a point at the given 'loc'.
   */
  _clickLoc(loc) {
    const EPSILON = 1e-6;
    const context = this.context;
    const editor = context.systems.editor;

    editor.beginTransaction();

    // Extend area by adding vertex at 'loc'...
    if (this.drawWay) {
      // The drawNode is at the start or end node, try to finish the line.
      // (Normally this situation would be caught in `_clickNode`, maybe the user held down modifier key?)
      if (vecEqual(loc, this.lastNode.loc, EPSILON) || vecEqual(loc, this.firstNode.loc, EPSILON)) {
        this._finish();
        return;
      }

      if (DEBUG) {
        console.log(`DrawAreaMode: _clickLoc, extending area to ${loc}`);  // eslint-disable-line no-console
      }

      editor.commit({
        annotation: this._getAnnotation(),   // Add annotation so we can undo to here
        selectedIDs: [this.drawWay.id]
      });

      // Replace draw node
      this.lastNode = this.drawNode;
      this.drawNode = osmNode({ loc: loc });
      editor.perform(
        actionAddEntity(this.drawNode),  // Create new draw node
        actionAddVertex(this.drawWay.id, this.drawNode.id)  // Add new draw node to draw way
      );

    // Start a new area at 'loc'...
    } else {
      if (DEBUG) {
        console.log(`DrawAreaMode: _clickLoc, starting area at ${loc}`); // eslint-disable-line no-console
      }
      this.firstNode = osmNode({ loc: loc });
      this.lastNode = this.firstNode;
      this.drawNode = osmNode({ loc: loc });
      this.drawWay = osmWay({
        tags: this.defaultTags,
        nodes: [ this.firstNode.id, this.drawNode.id, this.firstNode.id ]
      });

      editor.perform(
        actionAddEntity(this.drawNode),
        actionAddEntity(this.firstNode),
        actionAddEntity(this.drawWay)
      );
    }

    this._refreshEntities();
    editor.endTransaction();
  }


  /**
   * _clickWay
   * Clicked on an existing way, add a midpoint along the `edge` at given `loc` and start area from there
   */
  _clickWay(loc, edge) {
    const EPSILON = 1e-6;
    const context = this.context;
    const editor = context.systems.editor;
    const midpoint = { loc: loc, edge: edge };

    editor.beginTransaction();

    // Extend area by adding vertex as midpoint along target edge...
    if (this.drawWay) {
      // The drawNode is at the start or end node, try to finish the line.
      // (Normally this situation would be caught in `_clickNode`, maybe the user held down modifier key?)
      if (vecEqual(loc, this.lastNode.loc, EPSILON) || vecEqual(loc, this.firstNode.loc, EPSILON)) {
        this._finish();
        return;
      }

      if (DEBUG) {
        console.log(`DrawAreaMode: _clickWay, extending area to edge ${edge}`);  // eslint-disable-line no-console
      }

      editor.perform(
        actionMoveNode(this.drawNode.id, loc),       // Finalize position of old draw node at `loc`
        actionAddMidpoint(midpoint, this.drawNode)   // Add old draw node as a midpoint on target edge
      );
      editor.commit({
        annotation: this._getAnnotation(),   // Add annotation so we can undo to here
        selectedIDs: [this.drawWay.id]
      });

      // Replace draw node
      this.lastNode = this.drawNode;
      this.drawNode = osmNode({ loc: loc });
      editor.perform(
        actionAddEntity(this.drawNode),                       // Create new draw node
        actionAddVertex(this.drawWay.id, this.drawNode.id)    // Add new draw node to draw way
      );

    // Start a new area at `loc` on target edge...
    } else {
      if (DEBUG) {
        console.log(`DrawAreaMode: _clickWay, starting area at edge ${edge}`);  // eslint-disable-line no-console
      }
      this.firstNode = osmNode({ loc: loc });
      this.lastNode = this.firstNode;
      this.drawNode = osmNode({ loc: loc });
      this.drawWay = osmWay({
        tags: this.defaultTags,
        nodes: [ this.firstNode.id, this.drawNode.id, this.firstNode.id ]
      });

      editor.perform(
        actionAddEntity(this.firstNode),              // Create first node
        actionAddEntity(this.drawNode),               // Create new draw node (end)
        actionAddEntity(this.drawWay),                // Create new draw way
        actionAddMidpoint(midpoint, this.firstNode)   // Add first node as midpoint on target edge
      );
    }

    this._refreshEntities();
    editor.endTransaction();
  }


  /**
   * _clickNode
   * Clicked on an existing node, include that node in the area we are drawing.
   */
  _clickNode(loc, targetNode) {
    const EPSILON = 1e-6;
    const context = this.context;
    const editor = context.systems.editor;

    editor.beginTransaction();

    // Extend line by reusing target node as a vertex...
    // (Note that we don't need to replace the draw node in this scenario)
    if (this.drawWay) {
      // Clicked on first or last node, try to finish the area
      if (targetNode === this.lastNode || targetNode === this.firstNode ||
        vecEqual(loc, this.lastNode.loc, EPSILON) || vecEqual(loc, this.firstNode.loc, EPSILON)
      ) {
        this._finish();
        return;
      }

      if (DEBUG) {
        console.log(`DrawAreaMode: _clickNode, extending area to ${targetNode.id}`);  // eslint-disable-line no-console
      }

      // Time for a switcheroo- replace the 'draw' node with the target node, and annotate it for undo/redo
      editor.perform(
        this._actionRemoveDrawNode(this.drawWay.id, this.drawNode),   // Remove the draw node
        actionAddVertex(this.drawWay.id, targetNode.id)               // Add target node to draw way
      );
      editor.commit({
        annotation: this._getAnnotation(),   // Add annotation so we can undo to here
        selectedIDs: [this.drawWay.id]
      });

      // Now put the draw node back where it was and continue drawing
      this.lastNode = targetNode;
      editor.perform(
        actionAddEntity(this.drawNode),
        actionAddVertex(this.drawWay.id, this.drawNode.id)
      );

    // Start a new area at target node...
    } else {
      if (DEBUG) {
        console.log(`DrawAreaMode: _clickNode, starting line at ${targetNode.id}`); // eslint-disable-line no-console
      }

      this.firstNode = targetNode;
      this.lastNode = this.firstNode;
      this.drawNode = osmNode({ loc: loc });
      this.drawWay = osmWay({
        tags: this.defaultTags,
        nodes: [ this.firstNode.id, this.drawNode.id, this.firstNode.id ]
      });

      editor.perform(
        actionAddEntity(this.drawNode),
        actionAddEntity(this.drawWay)
      );
    }

    this._refreshEntities();
    editor.endTransaction();
  }


  /**
   * _actionRemoveDrawNode
   */
  _actionRemoveDrawNode(wayID, drawNode) {
    return function(graph) {
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
        console.log(`DrawAreaMode: _finish, drawWay.id = ${this.drawWay.id}`);  // eslint-disable-line no-console
      }
      this.context.enter('select-osm', { selection: { osm: [this.drawWay.id], newFeature: true }});
    } else {
      this._cancel();
    }
  }


  /**
   * _cancel
   * Return to browse mode
   * Note that `exit()` will be called immediately after this to perform cleanup.
   */
  _cancel() {
    if (DEBUG) {
      console.log(`DrawAreaMode: _cancel`); // eslint-disable-line no-console
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
