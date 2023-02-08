import { /*geomViewportNudge, */ vecAdd, vecSubtract } from '@id-sdk/math';
import { utilArrayIntersection } from '@id-sdk/util';

import { AbstractMode } from './AbstractMode';

import { actionAddMidpoint } from '../actions/add_midpoint';
import { actionConnect } from '../actions/connect';
import { actionMoveNode } from '../actions/move_node';
import { actionNoop } from '../actions/noop';

import { geoChooseEdge /*, geoHasLineIntersections, geoHasSelfIntersections */} from '../geo';
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

    this.dragNode = null;             // The node being dragged
    this.drawingParentIDs = [];
    this._restoreSelectedIDs = null;
    this._wasMidpoint = false;        // Used to set the correct edit annotation
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

    // We will try to restore the selection to what it was when we entered this mode.
    this._restoreSelectedIDs = context.selectedIDs();

    const selection = options.selection;
    if (!(selection instanceof Map)) return false;
    if (!selection.size) return false;

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
          .iconName('#iD-icon-no')
          .label(t('modes.drag_node.connected_to_hidden'))();
        return false;
      }
    }
    this._active = true;

    // Convert a midpoint to a node..
    if (this._wasMidpoint) {
      const midpoint = { loc: entity.loc, edge: [entity.a.id, entity.b.id] };
      entity = osmNode();
      context.perform(actionAddMidpoint(midpoint, entity), t('operations.add.annotation.vertex'));
      entity = context.entity(entity.id);   // get post-action entity
    } else {
      context.perform(actionNoop());
    }

    // While drawing, we want to hide the hit targets being generated for the node and any ways attached to it.
    this.dragNode = entity;
    const scene = this.context.scene();
    this.drawingParentIDs = this.context.graph().parentWays(this.dragNode);

    scene.classData('osm', this.dragNode.id, 'drawing');
    // While we're dragging, we need to ensure that the parent ways and all their nodes are also 'drawing'. This does two things:
    // Ensures that the area fills aren't targetable
    // Ensures that the nodes are being drawn / are therefore targetable

    this.drawingParentIDs.forEach(parentWay => {
      scene.classData('osm', parentWay.id, 'drawing');
      parentWay.nodes.forEach(node => {
        if (node !== this.dragNode.id) { scene.classData('osm', node, 'drawing'); }
      });
    });

    this._startLoc = entity.loc;

    // `_clickLoc` is used later to calculate a drag offset,
    // to correct for where "on the pin" the user grabbed the target.
    const clickCoord = context.behaviors.get('drag').lastDown.coord;
    this._clickLoc = context.projection.invert(clickCoord);

    this._updateCollections();

    context.enableBehaviors(['hover', 'drag']);

    context.behaviors.get('drag')
      .on('move', this._move)
      .on('end', this._end)
      .on('cancel', this._cancel);

    context.history()
      .on('undone.drag-node', this._cancel);

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    this._selectedData.clear();
    this._wasMidpoint = false;
    this.context.scene().clearClass('drawing');
    this.context.scene().dirtyFeatures(this.drawingParentIDs);
    this.drawingParentIDs = [];
    this.dragNode = null;
    this._startLoc = null;
    this._clickLoc = null;

    this.context.behaviors.get('drag')
      .off('move', this._move)
      .off('end', this._end)
      .off('cancel', this._cancel);

    this.context.history()
      .on('undone.drag-node', null);

    // this._stopNudge();
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

    // Allow snapping only for OSM Entities in the actual graph (i.e. not RapiD features)
    const target = eventData.target;
    const datum = target && target.data;
    const entity = datum && graph.hasEntity(datum.id);

    // Snap to a node
    if (entity && entity.type === 'node') {
      this.lastLoc = entity.loc;

    // Snap to a way that isn't the node's parent
    } else if (entity && entity.type === 'way' && !graph.parentWays(this.dragNode).includes(entity)) {
      const activeIDs = context.activeIDs();
      const activeID = activeIDs.length ? activeIDs[0] : undefined;  // get the first one, if any
      const choice = geoChooseEdge(graph.childNodes(entity), coord, projection, activeID);
const SNAP_DIST = 6;  // hack to avoid snap to fill, see #719
if (choice && choice.distance < SNAP_DIST) {
        this.lastLoc = choice.loc;
      }

    // No snap - use the coordinate we get from the event
    } else {
      this.lastLoc = projection.invert(coord);
    }

    this._doMove(projection.project(this.lastLoc));
  }


  /**
   * _end
   * Complete the drag
   * @param  eventData  `Object` data received from the drag behavior
   */
  _end(eventData) {
    if (!this.dragNode) return;

    const context = this.context;
    const graph = context.graph();
    const entity = this.dragNode;
    const isPoint = entity.geometry(graph) === 'point';   // i.e. not a vertex along a line
    const target = eventData.target?.data;    // entity to snap to

    // const nope = graph.parentWays(entity).includes(target);
    const nope = null;

    if (nope) {   // bounce back
      context.perform(_actionBounceBack(entity.id, this._startLoc));

    // Snap to a Way
    } else if (target && target.type === 'way' && !target.__fbid__) {
      const choice = geoChooseEdge(graph.childNodes(target), eventData.coord, context.projection, entity.id);
const SNAP_DIST = 6;  // hack to avoid snap to fill, see #719
if (choice && choice.distance < SNAP_DIST) {
        const edge = [target.nodes[choice.index - 1], target.nodes[choice.index]];
        context.replace(
          actionAddMidpoint({loc: choice.loc, edge: edge }, entity),
          this._connectAnnotation(entity, target)
        );
} else {
        context.replace(actionNoop(), this._moveAnnotation(entity));
}

    // Snap to a Node
    } else if (target && target.type === 'node' && this._canSnapToNode(target)) {
      context.replace(actionConnect([target.id, entity.id]), this._connectAnnotation(entity, target));

    } else if (this._wasMidpoint) {
      context.replace(actionNoop(), t('operations.add.annotation.vertex'));

    } else {
      context.replace(actionNoop(), this._moveAnnotation(entity));
    }

    // choose next mode
    if (isPoint) {
      context.enter(modeSelect(context, [entity.id]));
    } else {
      const reselection = this._restoreSelectedIDs.filter(id => graph.hasEntity(id));
      if (reselection.length) {
        context.enter(modeSelect(context, reselection));
      } else {
        context.enter('browse');
      }
    }


    function _actionBounceBack(nodeID, toLoc) {
      const moveNode = actionMoveNode(nodeID, toLoc);
      const action = function(graph, t) {
        // last time through, pop off the bounceback perform.
        // it will then overwrite the initial perform with a moveNode that does nothing
        if (t === 1) context.pop();
        return moveNode(graph, t);
      };
      action.transitionable = true;
      return action;
    }

  }


  /**
   * _cancel
   * Return to browse mode without doing anything
   */
  _cancel() {
    this.context.enter('browse');
  }


  /**
   * _doMove
   * Can either get here from the _move handler, or the nudge.
   * @param  coord  `[x,y]` screen coordinate of the latest event
   * @param  nudge  `[x,y]` optional offset to nudge the map by
   */
  _doMove(coord /*, nudge = [0, 0] */) {
    if (!this.dragNode) return;

    const context = this.context;
    // var currMouse = vecSubtract(coord, nudge);

    // The "drag offset" is the difference between where the user grabbed
    // the marker/pin and where the location of the node actually is.
    // We calculate the drag offset each time because it's possible
    // the user may have changed zooms while dragging..
    const clickCoord = context.projection.project(this._clickLoc);
    const startCoord = context.projection.project(this._startLoc);
    const dragOffset = vecSubtract(startCoord, clickCoord);
    coord = vecAdd(coord, dragOffset);

    const loc = context.projection.invert(coord);
    if (locationManager.blocksAt(loc).length) {  // editing is blocked here
      this._cancel();
      return;
    }

    const entity = this.dragNode;
    context.replace(actionMoveNode(entity.id, loc));
    this.dragNode = context.entity(entity.id);   // get post-action entity

    this._updateCollections();
  }


  /**
   * _updateCollections
   * Updates the "active" and "selected" collections
   * - active should contain the dragNode  (and it's parent way maybe?)
   * - selected should contain the dragNode
   */
  _updateCollections() {
    this._selectedData.clear();
    if (this.dragNode) {
      this._selectedData.set(this.dragNode.id, this.dragNode);
    }

    this._activeData.clear();
//    if (this.drawWay) {
//      this._activeData.set(this.drawWay.id, this.drawWay);
//    }
    if (this.dragNode) {
      this._activeData.set(this.dragNode.id, this.dragNode);
    }
  }


  /**
   * _moveAnnotation
   */
  _moveAnnotation(entity) {
    const geometry = entity.geometry(this.context.graph());
    return t(`operations.move.annotation.${geometry}`);
  }


  /**
   * _connectAnnotation
   */
  _connectAnnotation(nodeEntity, targetEntity) {
    const context = this.context;
    const graph = context.graph();

    const nodeGeometry = nodeEntity.geometry(graph);
    const targetGeometry = targetEntity.geometry(graph);

    if (nodeGeometry === 'vertex' && targetGeometry === 'vertex') {
      const nodeParentWayIDs = graph.parentWays(nodeEntity);
      const targetParentWayIDs = graph.parentWays(targetEntity);
      const sharedParentWays = utilArrayIntersection(nodeParentWayIDs, targetParentWayIDs);
      // if both vertices are part of the same way
      if (sharedParentWays.length !== 0) {
        // if the nodes are next to each other, they are merged
        if (sharedParentWays[0].areAdjacent(nodeEntity.id, targetEntity.id)) {
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

}


//  mode.selectedIDs = function() {
//    if (!arguments.length) return dragNode ? [dragNode.id] : [];
//    // no assign
//    return mode;
//  };
//
//  mode.activeID = function() {
//    if (!arguments.length) return dragNode && dragNode.id;
//    // no assign
//    return mode;
//  };


//
//   old
//  /**
//   * doMove
//   */
//  function doMove(point, entity, nudge = [0, 0] ) {
//    if (!this.dragNode) return;
//
//    const currPoint = [point[0], point[1]] || context.projection.project(_lastLoc);
//    // var currMouse = vecSubtract(currPoint, nudge);
//    const loc = context.projection.invert(currPoint);
//
//    if (locationManager.blocksAt(loc).length) {  // editing is blocked here
//      cancel();
//      return;
//    }
//    var target, edge;
//    if (!_nudgeInterval) {   // If not nudging at the edge of the viewport, try to snap..
//        // related code
//        // - `mode/drag_node.js`     `doMove()`
//        // - `behaviors/draw.js`      `click()`
//        // - `behaviors/draw_way.js`  `move()`
//        var d = datum(e);
//        target = d && d.properties && d.properties.entity;
//        var targetLoc = target && target.loc;
//        var targetNodes = d && d.properties && d.properties.nodes;
//        if (targetLoc) {   // snap to node/vertex - a point target with `.loc`
//            if (shouldSnapToNode(target)) {
//                loc = targetLoc;
//            }
//        } else if (targetNodes) {   // snap to way - a line target with `.nodes`
//            edge = geoChooseEdge(targetNodes, context.map().mouse(), context.projection, end.id);
//            if (edge) {
//                loc = edge.loc;
//            }
//        }
//    }
//
//    context.replace(actionMoveNode(entity.id, loc));
//
//    // Below here: validations
//    var isInvalid = false;
//    // Check if this connection to `target` could cause relations to break..
//    if (target) {
//        isInvalid = hasRelationConflict(entity, target, edge, context.graph());
//    }
//    // Check if this drag causes the geometry to break..
//    if (!isInvalid) {
//        isInvalid = hasInvalidGeometry(entity, context.graph());
//    }
//    var nope = context.surface().classed('nope');
//    if (isInvalid === 'relation' || isInvalid === 'restriction') {
//        if (!nope) {   // about to nope - show hint
//            context.ui().flash
//                .duration(4000)
//                .iconName('#iD-icon-no')
//                .label(t('operations.connect.' + isInvalid,
//                    { relation: presetManager.item('type/restriction').name() }
//                ))();
//        }
//    } else if (isInvalid) {
//        var errorID = isInvalid === 'line' ? 'lines' : 'areas';
//        context.ui().flash
//            .duration(3000)
//            .iconName('#iD-icon-no')
//            .label(t('self_intersection.error.' + errorID))();
//    } else {
//        if (nope) {   // about to un-nope, remove hint
//            context.ui().flash
//                .duration(1)
//                .label('')();
//        }
//    }
//    var nopeDisabled = context.surface().classed('nope-disabled');
//    if (nopeDisabled) {
//        context.surface()
//            .classed('nope', false)
//            .classed('nope-suppressed', isInvalid);
//    } else {
//        context.surface()
//            .classed('nope', isInvalid)
//            .classed('nope-suppressed', false);
//    }
//
//    _lastLoc = loc;
//  }


//  // Uses `actionConnect.disabled()` to know whether this connection is ok..
//  function hasRelationConflict(entity, target, edge, graph) {
//    var testGraph = graph.update();  // copy
//
//    // if snapping to way - add midpoint there and consider that the target..
//    if (edge) {
//      var midpoint = osmNode();
//      var action = actionAddMidpoint({
//        loc: edge.loc,
//        edge: [target.nodes[edge.index - 1], target.nodes[edge.index]]
//      }, midpoint);
//
//      testGraph = action(testGraph);
//      target = midpoint;
//    }
//
//    // can we connect to it?
//    var ids = [entity.id, target.id];
//    return actionConnect(ids).disabled(testGraph);
//  }
//
//
//  function hasInvalidGeometry(entity, graph) {
//    var parents = graph.parentWays(entity);
//    var i, j, k;
//
//    for (i = 0; i < parents.length; i++) {
//      var parent = parents[i];
//      var nodes = [];
//      var activeIndex = null;    // which multipolygon ring contains node being dragged
//
//      // test any parent multipolygons for valid geometry
//      var relations = graph.parentRelations(parent);
//      for (j = 0; j < relations.length; j++) {
//        if (!relations[j].isMultipolygon()) continue;
//
//        var rings = osmJoinWays(relations[j].members, graph);
//
//        // find active ring and test it for self intersections
//        for (k = 0; k < rings.length; k++) {
//          nodes = rings[k].nodes;
//          if (nodes.find(function(n) { return n.id === entity.id; })) {
//            activeIndex = k;
//            if (geoHasSelfIntersections(nodes, entity.id)) {
//              return 'multipolygonMember';
//            }
//          }
//          rings[k].coords = nodes.map(function(n) { return n.loc; });
//        }
//
//        // test active ring for intersections with other rings in the multipolygon
//        for (k = 0; k < rings.length; k++) {
//          if (k === activeIndex) continue;
//
//          // make sure active ring doesn't cross passive rings
//          if (geoHasLineIntersections(rings[activeIndex].nodes, rings[k].nodes, entity.id)) {
//            return 'multipolygonRing';
//          }
//        }
//      }
//
//      // If we still haven't tested this node's parent way for self-intersections.
//      // (because it's not a member of a multipolygon), test it now.
//      if (activeIndex === null) {
//        nodes = parent.nodes.map(function(nodeID) { return graph.entity(nodeID); });
//        if (nodes.length && geoHasSelfIntersections(nodes, entity.id)) {
//          return parent.geometry(graph);
//        }
//      }
//
//    }
//
//    return false;
//  }

