import { vecAdd, vecSubtract } from '@rapid-sdk/math';
import { utilArrayIntersection } from '@rapid-sdk/util';

import { AbstractMode } from './AbstractMode';
import { actionAddMidpoint } from '../actions/add_midpoint';
import { actionConnect } from '../actions/connect';
import { actionMoveNode } from '../actions/move_node';
import { actionNoop } from '../actions/noop';
import { geoChooseEdge } from '../geo';
import { locationManager } from '../core/LocationManager';
import { modeSelect } from './select';
import { osmNode } from '../osm';
import { presetManager } from '../presets';
import { t } from '../core/localizer';



/**
 * `ModeDragNode`
 *  In this mode, the user has started dragging a point or vertex.
 */
export class ModeDragNode extends AbstractMode {

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
  }


  /**
   * enter
   * Expects a `selection` property in the options argument as a `Map(datumID -> datum)`
   * @param  `options`  Optional `Object` of options passed to the new mode
   * @return `true` if the mode can be entered, `false` if not
   */
  enter(options = {}) {
    const context = this.context;

    const selection = options.selection;
    if (!(selection instanceof Map)) return false;
    if (!selection.size) return false;

    // When exiting mode, we'll try to restore the selection to what it was when we entered this mode.
    this._reselectIDs = options.reselectIDs ?? [];

    let [entity] = selection.values();   // the first thing in the selection

    // This check was in start() before to prevent user from entering the mode.
    // It's an odd check, not sure if still needed or why?  (low zooms?)
    if (!context.editable()) return false;

    this._wasMidpoint = (entity.type === 'midpoint');

    if (!this._wasMidpoint) {
      // Bail out if the node is connected to something hidden.
      const hasHidden = context.features().hasHiddenConnections(entity, context.graph());
      if (hasHidden) {
        context.ui().flash
          .duration(4000)
          .iconName('#rapid-icon-no')
          .label(t('modes.drag_node.connected_to_hidden'))();
        return false;
      }
    }

    this._active = true;

    // Convert a midpoint to a node..
    if (this._wasMidpoint) {
      const midpoint = { loc: entity.loc, edge: [ entity.a.id, entity.b.id ] };
      entity = osmNode();
      context.perform(actionAddMidpoint(midpoint, entity));
      entity = context.entity(entity.id);   // get post-action entity
    } else {
      context.perform(actionNoop());
    }

    this.dragNode = entity;
    this._startLoc = entity.loc;

    // Set the 'drawing' class so that the dragNode and any parent ways won't emit events
    const scene = context.scene();
    scene.classData('osm', this.dragNode.id, 'drawing');
    for (const parent of context.graph().parentWays(this.dragNode)) {
      scene.classData('osm', parent.id, 'drawing');
    }

    // `_clickLoc` is used later to calculate a drag offset,
    // to correct for where "on the pin" the user grabbed the target.
    const clickCoord = context.behaviors.get('drag').lastDown.coord;
    this._clickLoc = context.projection.invert(clickCoord);

    context.enableBehaviors(['hover', 'drag']);

    context.behaviors.get('drag')
      .on('move', this._move)
      .on('end', this._end)
      .on('cancel', this._cancel);

    context.history().on('undone.ModeDragNode redone.ModeDragNode', this._cancel);

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
    this.context.scene().clearClass('drawing');

    this.context.behaviors.get('drag')
      .off('move', this._move)
      .off('end', this._end)
      .off('cancel', this._cancel);

    this.context.history().on('undone.ModeDragNode redone.ModeDragNode', null);
  }


  /**
   * _refreshEntities
   *  Gets the latest version the drag node from the graph after any modifications.
   *  Updates `selectedData` collection to include the draw way
   */
  _refreshEntities() {
    const context = this.context;
    const graph = context.graph();

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
    const graph = context.graph();
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

    if (locationManager.blocksAt(loc).length) {  // editing is blocked here
      this._cancel();
      return;
    }

    context.replace(actionMoveNode(this.dragNode.id, loc));
    this._refreshEntities();
  }


  /**
   * _end
   * Complete the drag.
   * This calls `replace` to finalize the graph state with an annotation so that we can undo/redo to here.
   * Note that `exit()` will be called immediately after this to perform cleanup.
   * @param  eventData  `Object` data received from the drag behavior
   */
  _end(eventData) {
    if (!this.dragNode) return;

    const context = this.context;
    const graph = context.graph();
    const isPoint = this.dragNode.geometry(graph) === 'point';   // i.e. not a vertex along a line

    // Allow snapping only for OSM Entities in the actual graph (i.e. not Rapid features)
    const datum = eventData?.target?.data;
    const choice = eventData?.target?.choice;
    const target = datum && graph.hasEntity(datum.id);

    // Snap to a Node
    if (target?.type === 'node' && this._canSnapToNode(target)) {
      context.replace(
        actionConnect([ target.id, this.dragNode.id ]),
        this._connectAnnotation(target)
      );

    // Snap to a Way
//    } else if (target?.type === 'way' && choice) {
//      const edge = [ target.nodes[choice.index - 1], target.nodes[choice.index] ];
//      context.replace(
//        actionAddMidpoint({ loc: choice.loc, edge: edge }, this.dragNode),
//        this._connectAnnotation(target)
//      );
    } else if (target?.type === 'way') {
      const choice = geoChooseEdge(graph.childNodes(target), eventData.coord, context.projection, this.dragNode.id);
      const SNAP_DIST = 6;  // hack to avoid snap to fill, see #719
      if (choice && choice.distance < SNAP_DIST) {
        const edge = [ target.nodes[choice.index - 1], target.nodes[choice.index] ];
        context.replace(
          actionAddMidpoint({ loc: choice.loc, edge: edge }, this.dragNode),
          this._connectAnnotation(target)
        );
      } else {
        context.replace(actionNoop(), this._moveAnnotation());
      }

    } else if (this._wasMidpoint) {
      context.replace(actionNoop(), t('operations.add.annotation.vertex'));

    } else {
      context.replace(actionNoop(), this._moveAnnotation());
    }

    // Choose next mode
    if (isPoint && context.hasEntity(this.dragNode.id)) {
      context.enter(modeSelect(context, [this.dragNode.id]));
    } else if (this._reselectIDs.length) {
      context.enter(modeSelect(context, this._reselectIDs));
    } else {
      context.enter('browse');
    }
  }


  /**
   * _moveAnnotation
   */
  _moveAnnotation() {
    if (!this.dragNode) return undefined;

    const geometry = this.dragNode.geometry(this.context.graph());
    return t(`operations.move.annotation.${geometry}`);
  }


  /**
   * _connectAnnotation
   * @param  target  The entity we are connecting the dragNode to
   */
  _connectAnnotation(target) {
    if (!this.dragNode || !target) return undefined;

    const graph = this.context.graph();
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
          return t('operations.connect.annotation.from_vertex.to_adjacent_vertex');
        }
        return t('operations.connect.annotation.from_vertex.to_sibling_vertex');
      }
    }
    return t(`operations.connect.annotation.from_${nodeGeometry}.to_${targetGeometry}`);
  }


  /**
   * _canSnapToNode
   * @param  target  The entity we are considering snapping the node to.
   */
  _canSnapToNode(target) {
    if (!this.dragNode) return false;

    const graph = this.context.graph();
    return this.dragNode.geometry(graph) !== 'vertex' ||
      (target.geometry(graph) === 'vertex' || presetManager.allowsVertex(target, graph));
  }


  /**
   * _cancel
   * Return to browse mode without doing anything
   * Note that `exit()` will be called immediately after this to perform cleanup.
   */
  _cancel() {
    this.context.enter('browse');
  }

}

