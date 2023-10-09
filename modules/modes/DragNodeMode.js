import { vecAdd, vecSubtract } from '@rapid-sdk/math';
import { utilArrayIntersection } from '@rapid-sdk/util';

import { AbstractMode } from './AbstractMode';
import { actionAddMidpoint } from '../actions/add_midpoint';
import { actionConnect } from '../actions/connect';
import { actionMoveNode } from '../actions/move_node';
import { geoChooseEdge } from '../geo';
import { osmNode } from '../osm';



/**
 * `DragNodeMode`
 *  In this mode, the user has started dragging a point or vertex.
 */
export class DragNodeMode extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'drag-node';

    this.dragNode = null;         // The node being dragged

    this._reselectIDs = [];       // When finished dragging, restore the selelected ids from before
    this._wasMidpoint = false;    // Used to set the correct edit annotation
    this._startLoc = null;
    this._clickLoc = null;

    // Make sure the event handlers have `this` bound correctly
    this._move = this._move.bind(this);
    this._end = this._end.bind(this);
    this._cancel = this._cancel.bind(this);
    this._historychange = this._historychange.bind(this);
  }


  /**
   * enter
   * Enters the mode.
   * @param  {Object?}  options - Optional `Object` of options passed to the new mode
   * @param  {string}   options.nodeID - if set, drag the node for the given id
   * @param  {Object}   options.midpoint - if set, create a node from the given midpoint
   *                      for example `{ loc: entity.loc, edge: [ entity.a.id, entity.b.id ] }`
   * @return {boolean}  `true` if the mode can be entered, `false` if not
   */
  enter(options = {}) {
    const context = this.context;
    const editor = context.systems.editor;
    const filters = context.systems.filters;
    const l10n = context.systems.l10n;
    const locations = context.systems.locations;
    const ui = context.systems.ui;

    this._reselectIDs = options.reselectIDs ?? [];
    const midpoint = options.midpoint;
    const nodeID = options.nodeID;

    let graph = editor.current.graph;
    let entity;

    if (midpoint) {
      if (!graph.hasEntity(midpoint.edge[0])) return;
      if (!graph.hasEntity(midpoint.edge[1])) return;
      entity = osmNode();
      editor.perform(actionAddMidpoint(midpoint, entity));
      graph = editor.current.graph;         // refresh with post-action graph
      entity = graph.hasEntity(entity.id);  // refresh with post-action entity
      if (!entity) {  // somehow the midpoint did not convert to a node
        editor.rollback();
        return;
      }
      this._wasMidpoint = true;

    } else if (nodeID) {
      entity = graph.hasEntity(nodeID);
      this._wasMidpoint = false;
    }

    if (!entity) return;

    if (!this._wasMidpoint) {
      // Bail out if the node is connected to something hidden.
      const hasHidden = filters.hasHiddenConnections(entity, graph);
      if (hasHidden) {
        ui.flash
          .duration(4000)
          .iconName('#rapid-icon-no')
          .label(l10n.t('modes.drag_node.connected_to_hidden'))();
        return false;
      }
    }

    this._active = true;

    this.dragNode = entity;
    this._startLoc = entity.loc;

    // Set the 'drawing' class so that the dragNode and any parent ways won't emit events
    const scene = context.scene();
    scene.classData('osm', this.dragNode.id, 'drawing');
    for (const parent of editor.current.graph.parentWays(this.dragNode)) {
      scene.classData('osm', parent.id, 'drawing');
    }

    // `_clickLoc` is used later to calculate a drag offset,
    // to correct for where "on the pin" the user grabbed the target.
    const clickCoord = context.behaviors.drag.lastDown.coord;
    this._clickLoc = context.projection.invert(clickCoord);

    context.enableBehaviors(['hover', 'drag']);

    context.behaviors.drag
      .on('move', this._move)
      .on('end', this._end)
      .on('cancel', this._cancel);

    editor
      .on('historychange', this._historychange);

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    this.dragNode = null;
    this._startLoc = null;
    this._clickLoc = null;
    this._wasMidpoint = false;
    this._selectedData.clear();

    const context = this.context;
    const editor = context.systems.editor;

    context.scene().clearClass('drawing');

    context.behaviors.drag
      .off('move', this._move)
      .off('end', this._end)
      .off('cancel', this._cancel);

    editor
      .off('historychange', this._historychange);
  }


  /**
   * _refreshEntities
   *  Gets the latest version the drag node from the graph after any modifications.
   *  Updates `selectedData` collection to include the draw way
   */
  _refreshEntities() {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.current.graph;

    this._selectedData.clear();
    this.dragNode = this.dragNode && graph.hasEntity(this.dragNode.id);

    // Bail out if drag node has gone missing
    if (!this.dragNode) {
      this._cancel();
      return;
    }

    this._selectedData.set(this.dragNode.id, this.dragNode);
  }


  /**
   * _move
   * Move the dragging node
   * @param  eventData  `Object` data received from the drag behavior
   */
  _move(eventData) {
    if (!this.dragNode) return;

    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.current.graph;
    const locations = context.systems.locations;
    const projection = context.projection;
    const coord = eventData.coord;

    // Allow snapping only for OSM Entities in the actual graph (i.e. not Rapid features)
    const datum = eventData?.target?.data;
    const choice = eventData?.target?.choice;
    const target = datum && graph.hasEntity(datum.id);
    let loc;

    // Snap to a node
    if (target?.type === 'node' && this._canSnapToNode(target)) {
      loc = target.loc;

    // Snap to a way
//    } else if (target?.type === 'way' && choice) {
//      loc = choice.loc;
//    }
    } else if (target?.type === 'way') {
      const choice = geoChooseEdge(graph.childNodes(target), coord, projection, this.dragNode.id);
      const SNAP_DIST = 6;  // hack to avoid snap to fill, see #719
      if (choice && choice.distance < SNAP_DIST) {
        loc = choice.loc;
      }
    }

    // No snap - use the coordinate we get from the event
    if (!loc) {
      // The "drag offset" is the difference between where the user grabbed
      // the marker/pin and where the location of the node actually is.
      // We calculate the drag offset each time because it's possible
      // the user may have changed zooms while dragging..
      const clickCoord = context.projection.project(this._clickLoc);
      const startCoord = context.projection.project(this._startLoc);
      const dragOffset = vecSubtract(startCoord, clickCoord);
      const adjustedCoord = vecAdd(coord, dragOffset);
      loc = projection.invert(adjustedCoord);
    }

    if (locations.blocksAt(loc).length) {  // editing is blocked here
      this._cancel();
      return;
    }

    editor.perform(actionMoveNode(this.dragNode.id, loc));
    this._refreshEntities();
  }


  /**
   * _end
   * Complete the drag.
   * This calls `commit` to finalize the current edit with an annotation so that we can undo/redo to here.
   * Note that `historychanged()` will be called immediately after this to choose the next mode.
   * @param  eventData  `Object` data received from the drag behavior
   */
  _end(eventData) {
    if (!this.dragNode) return;

    const context = this.context;
    const editor = context.systems.editor;
    const l10n = context.systems.l10n;
    let graph = editor.current.graph;

    // Allow snapping only for OSM Entities in the actual graph (i.e. not Rapid features)
    const datum = eventData?.target?.data;
    const choice = eventData?.target?.choice;
    const target = datum && graph.hasEntity(datum.id);
    let annotation;

    // Snap to a Node
    if (target?.type === 'node' && this._canSnapToNode(target)) {
      editor.perform(actionConnect([ target.id, this.dragNode.id ]));
      annotation = this._connectAnnotation(target);

    // Snap to a Way
//    } else if (target?.type === 'way' && choice) {
//      const edge = [ target.nodes[choice.index - 1], target.nodes[choice.index] ];
//      editor.perform(actionAddMidpoint({ loc: choice.loc, edge: edge }, this.dragNode));
//      annotation = this._connectAnnotation(target);
    } else if (target?.type === 'way') {
      const choice = geoChooseEdge(graph.childNodes(target), eventData.coord, context.projection, this.dragNode.id);
      const SNAP_DIST = 6;  // hack to avoid snap to fill, see Rapid#719
      if (choice && choice.distance < SNAP_DIST) {
        const edge = [ target.nodes[choice.index - 1], target.nodes[choice.index] ];
        editor.perform(actionAddMidpoint({ loc: choice.loc, edge: edge }, this.dragNode));
        annotation = this._connectAnnotation(target);
      } else {
        annotation = this._moveAnnotation();
      }

    } else if (this._wasMidpoint) {
      annotation = l10n.t('operations.add.annotation.vertex');

    } else {
      annotation = this._moveAnnotation();
    }

    editor.commit(annotation);  // We will receive historychange event
  }


  /**
   * _moveAnnotation
   */
  _moveAnnotation() {
    if (!this.dragNode) return undefined;

    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.current.graph;
    const l10n = context.systems.l10n;

    const geometry = this.dragNode.geometry(graph);
    return l10n.t(`operations.move.annotation.${geometry}`);
  }


  /**
   * _connectAnnotation
   * @param  target  The entity we are connecting the dragNode to
   */
  _connectAnnotation(target) {
    if (!this.dragNode || !target) return undefined;

    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.current.graph;
    const l10n = context.systems.l10n;

    const nodeGeometry = this.dragNode.geometry(graph);
    const targetGeometry = target.geometry(graph);

    if (nodeGeometry === 'vertex' && targetGeometry === 'vertex') {
      const nodeParentWayIDs = graph.parentWays(this.dragNode);
      const targetParentWayIDs = graph.parentWays(target);
      const sharedParentWays = utilArrayIntersection(nodeParentWayIDs, targetParentWayIDs);
      // if both vertices are part of the same way
      if (sharedParentWays.length !== 0) {
        // if the nodes are next to each other, they are merged
        if (sharedParentWays[0].areAdjacent(this.dragNode.id, target.id)) {
          return l10n.t('operations.connect.annotation.from_vertex.to_adjacent_vertex');
        }
        return l10n.t('operations.connect.annotation.from_vertex.to_sibling_vertex');
      }
    }
    return l10n.t(`operations.connect.annotation.from_${nodeGeometry}.to_${targetGeometry}`);
  }


  /**
   * _canSnapToNode
   * @param  target  The entity we are considering snapping the node to.
   */
  _canSnapToNode(target) {
    if (!this.dragNode) return false;

    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.current.graph;
    const presets = context.systems.presets;

    return this.dragNode.geometry(graph) !== 'vertex' ||
      (target.geometry(graph) === 'vertex' || presets.allowsVertex(target, graph));
  }


  /**
   * _cancel
   * Return to browse mode without doing anything
   * Note that `exit()` will be called immediately after this to perform cleanup.
   */
  _cancel() {
    const context = this.context;
    const editor = context.systems.editor;

    editor.rollback();
    this.context.enter('browse');
  }


  /**
   * _historychange
   * A change has happened, so we need to decide what mode to switch to next.
   * If possible select the dragged node.
   */
  _historychange() {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.current.graph;

    const dragNode = this.dragNode && graph.hasEntity(this.dragNode.id);
    const isPoint = dragNode && dragNode.geometry(graph) === 'point';   // i.e. not a vertex along a line

    // Choose next mode
    if (dragNode && isPoint) {
      context.enter('select-osm', { selection: { osm: [dragNode.id] }} );
    } else if (this._reselectIDs.length) {
      context.enter('select-osm', { selection: { osm: this._reselectIDs }} );
    } else {
      context.enter('browse');
    }
  }

}
