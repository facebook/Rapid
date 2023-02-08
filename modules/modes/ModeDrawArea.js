import { vecEqual } from '@id-sdk/math';
import { AbstractMode } from './AbstractMode';

import { actionAddEntity } from '../actions/add_entity';
import { actionAddMidpoint } from '../actions/add_midpoint';
import { actionAddVertex } from '../actions/add_vertex';
import { actionMoveNode } from '../actions/move_node';
import { modeSelect } from '../modes/select';
import { actionNoop } from '../actions/noop';

import { locationManager } from '../core/LocationManager';
import { osmNode, osmWay } from '../osm';
import { geoChooseEdge } from '../geo';
import { t } from '../core/localizer';

const DEBUG = false;

/**
 * `ModeDrawArea`
 * In this mode, we are waiting for the user to place the initial point of an area
 */
export class ModeDrawArea extends AbstractMode {
  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);

    this.id = 'draw-area';
    this.defaultTags = {};

    this.drawWay = null; // The draw way just contains the way that we are drawing
    this.drawNode = null; // The draw node is temporary and just follows the pointer
    this.lastNode = null; // The last real node in the draw way
    this.firstNode = null; // The first real node in the draw way
    this.lastSegment = null; // The last way segment that we use to 'close' the poly as we draw
    this._clicks = 0;
    this._insertIndex = undefined;

    // Make sure the event handlers have `this` bound correctly
    this._click = this._click.bind(this);
    this._clickWay = this._clickWay.bind(this);
    this._clickNode = this._clickNode.bind(this);
    this._move = this._move.bind(this);
    this._removeDrawNode = this._removeDrawNode.bind(this);
    this._finish = this._finish.bind(this);

  }

  /**
   * enter
   */
  enter() {
    if (DEBUG) {
      console.log('ModeDrawArea: entering'); // eslint-disable-line no-console
    }

    const context = this.context;
    this._active = true;
    this.defaultTags = { area: 'yes' };
    this.drawWay = null;
    this.drawNode = null;
    this.lastNode = null;
    this.firstNode = null;
    this._insertIndex = undefined;
    this._clicks = 0;
    this._selectedData.clear();
    context.history().checkpoint('draw-area-initial'); // save history checkpoint to return to if things go bad

    context.enableBehaviors(['hover', 'draw', 'map-nudging']);
    context.behaviors.get('draw')
      .on('move', this._move)
      .on('click', this._click)
      // .on('cancel', this._cancel)
      .on('finish', this._finish);

    context.behaviors.get('map-interaction').doubleClickEnabled = false;

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;

    if (DEBUG) {
      console.log('ModeDrawArea: exiting'); // eslint-disable-line no-console
    }

    const context = this.context;
    this._active = false;

    // Confirm that the drawn area exists and is valid..
    if (!this._drawAreaValid()) {
      if (DEBUG) {
        console.log('ModeDrawArea: draw area invalid, rolling back'); // eslint-disable-line no-console
      }
      context.history().reset('draw-area-initial'); // rollback to checkpoint
    }

    this.drawWay = null;
    this.drawNode = null;
    this.lastNode = null;
    this.firstNode = null;
    this._insertIndex = undefined;
    this._clicks = 0;
    this._selectedData.clear();

    context.behaviors
      .get('draw')
      .off('click', this._start)
      .off('cancel', this._cancel)
      .off('finish', this._cancel);

    window.setTimeout(() => {
      context.behaviors.get('map-interaction').doubleClickEnabled = true;
    }, 1000);
  }

  /**
   * _updateCollections
   * Updates the "active" and "selected" collections
   * - active should contain the drawWay and drawNode
   * - selected should contain the drawWay
   */
  _updateCollections() {
    this._selectedData.clear();
    if (this.drawWay) {
      this._selectedData.set(this.drawWay.id, this.drawWay);
    }

    this._activeData.clear();
    if (this.drawWay) {
      this._activeData.set(this.drawWay.id, this.drawWay);
    }
    if (this.drawNode) {
      this._activeData.set(this.drawNode.id, this.drawNode);
    }
  }

  /**
   * _actionClose
   * Helper function to force the given way to be closed (start and end at same node)
   * @param {string} with the osm id of the way
   * @returns a modified graph with the wayId closed (i.e. the starting node and final node have been joined)
  */
  _actionClose(wayId) {
    return function (graph) {
      return graph.replace(graph.entity(wayId).close());
    };
  }

  /**
   * _actionReplaceDrawNode
   * Helper function to get rid of the transient 'draw' node if we happen to click another node / way.
   * This removes the transient node from the current graph history state, and replaces it with the new point that was clicked on.
   * @param {*} wayId the id of the way getting one of its nodes swapped out- likely, the draw way
   * @param {*} drawNodeId the transient node ID to swap out
   * @param {*} replacementNodeId the node ID to swap out for the draw Node
   * @param {*} index the index at which to make the replacement
   * @returns a modified graph with a replacement node swapped in for the current 'draw' node.
   */
  _actionReplaceDrawNode(wayId, drawNode, replacementNode) {
    return function (graph) {
      graph = graph.replace(graph.entity(wayId).removeNode(drawNode.id)).remove(drawNode);
      return graph.replace(graph.entity(wayId).addNode(replacementNode.id, undefined));
    };
  }


  _actionRemoveDrawNode(wayId, drawNode) {
    return function (graph) {
      return graph.replace(graph.entity(wayId).removeNode(drawNode.id)).remove(drawNode);
    };
  }


  /**
   * _click
   * Process whatever the user clicked on.
   */
  _click(eventData) {
    const context = this.context;
    const projection = context.projection;
    const graph = context.graph();
    const coord = eventData.coord;
    const loc = projection.invert(coord);

    if (locationManager.blocksAt(loc).length) return; // editing is blocked here

    this._clicks++;
    //Now that the user has clicked, let them nudge the map by moving to the edge.
    context.behaviors.get('map-nudging').allow();

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
      const activeID = activeIDs.length ? activeIDs[0] : undefined; // get the first one, if any
      const choice = geoChooseEdge(graph.childNodes(entity), coord, projection, activeID);
const SNAP_DIST = 6;  // hack to avoid snap to fill, see #719
if (choice && choice.distance < SNAP_DIST) {
        const edge = [entity.nodes[choice.index - 1], entity.nodes[choice.index]];
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
    const context = this.context;
    const scene = context.scene();
    const EPSILON = 1e-6;
    context.pauseChangeDispatch();

    //Extend the way by adding vertex at 'loc'
    if (this.drawWay) {
      // The drawNode is at the start or end node, try to finish the line.
      // (Normally this situation would be caught in `_clickNode`, maybe the user held down modifier key?)
      if (
        vecEqual(loc, this.lastNode.loc, EPSILON) ||
        vecEqual(loc, this.firstNode.loc, EPSILON)
      ) {
        this._finish();
        return;
      }
      if (DEBUG) {
        console.log(`ModeDrawArea: _clickLoc, extending area to ${loc}`); // eslint-disable-line no-console
      }

      // Replace draw node
      this.lastNode = this.drawNode;
      this.drawNode = osmNode({ loc: loc });

      context.perform(
        actionAddEntity(this.drawNode), // Create new draw node
        actionAddVertex(this.drawWay.id, this.drawNode.id, this._insertIndex), // Add new draw node to draw way
        this._getAnnotation()
      );

      this.lastNode = context.entity(this.lastNode.id);
      this.drawWay = context.entity(this.drawWay.id);

      // Add this new node to the 'drawing' features set
      scene.classData('osm', this.drawNode.id, 'drawing');

      // Start a brand new area at 'loc'
    } else {
      if (DEBUG) {
        console.log(`ModeDrawArea: _clickLoc, starting area at ${loc}`); // eslint-disable-line no-console
      }
      this.firstNode = osmNode({ loc: loc });
      this.lastNode = this.firstNode;
      this.drawNode = osmNode({ loc: loc });
      this.drawWay = osmWay({
        tags: this.defaultTags,
        nodes: [this.firstNode.id, this.drawNode.id],
      });

      // Give these features the 'drawing' class
      scene.classData('osm', this.drawWay.id, 'drawing');
      scene.classData('osm', this.firstNode.id, 'drawing');
      scene.classData('osm', this.drawNode.id, 'drawing');

      context.perform(
        actionAddEntity(this.drawNode),
        actionAddEntity(this.firstNode),
        actionAddEntity(this.drawWay),
        this._actionClose(this.drawWay.id)
        // No annotation- we do not want to undo to this state, an area with one node location is pretty weird.
      );
      // Perform a no-op edit that will be replaced as the user moves the draw node around.
      context.perform(actionNoop(), this._getAnnotation());
    }

    context.resumeChangeDispatch();

    this.drawWay = context.entity(this.drawWay.id); // Refresh draw way
    this._updateCollections();
  }

  /**
   * _getAnnotation
   * An annotation is a text associated with the edit, such as "Started a line".
   * The edits on the history stack with annotations are the ones we can undo/redo back to.
   */
  _getAnnotation() {
    const which = this._clicks > 1 ? 'continue' : 'start';
    return t(`operations.${which}.annotation.area`);
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

    // Allow snapping only for OSM Entities in the actual graph (i.e. not RapiD features)
    const target = eventData.target;
    const datum = target && target.data;
    const entity = datum && graph.hasEntity(datum.id);

    // Snap to a node
    if (entity && entity.type === 'node') {
      loc = entity.loc;

    // Snap to a way
    } else if (entity && entity.type === 'way') {
      const activeIDs = context.activeIDs();
      const activeID = activeIDs.length ? activeIDs[0] : undefined; // get the first one, if any
      const choice = geoChooseEdge(graph.childNodes(entity), coord, projection, activeID);
const SNAP_DIST = 6;  // hack to avoid snap to fill, see #719
if (choice && choice.distance < SNAP_DIST) {
        loc = choice.loc;
      }
    }

    context.replace(
      actionMoveNode(this.drawNode.id, loc),
      this._getAnnotation()
    );
    this.drawNode = context.entity(this.drawNode.id);
    this._updateCollections();
  }

  /**
   * _clickWay
   * Clicked on an existing way, add a midpoint along the `edge` at given `loc` and start area from there
   */
  _clickWay(loc, edge) {
    const context = this.context;
    const scene = context.scene();

    // If the draw way already exists, we need to continue it with this new node.
    if (this.drawWay) {
      // The target node needs to be inserted "before" the draw node
      // If draw node is at the beginning, insert target 1 after beginning.
      // If draw node is at the end, insert target 1 before the end.
      const targetIndex =
      this.drawWay?.affix(this.drawNode.id) === 'prefix'
          ? 1
          : this.drawWay.nodes.length - 1;

      const oldDrawNode = this.drawNode;
      this.drawNode = osmNode({ loc: loc });

      context.perform(
        actionAddEntity(this.drawNode),
        actionAddMidpoint({ loc: loc, edge: edge }, oldDrawNode),
        actionAddVertex(this.drawWay.id, this.drawNode.id, targetIndex), // Add draw node to draw way
        this._getAnnotation()
      );

      this.drawWay = context.entity(this.drawWay.id);
    } else {
      // No draw way exists yet, so time to make a new way!

      const node = osmNode({ loc: loc });
      const drawNode = osmNode({loc: loc});
      const way = osmWay({ tags: this.defaultTags});

      this.drawWay = way;
      this.lastNode = node;
      this.drawNode = drawNode;
      if (DEBUG) {
        console.log(`ModeDrawArea: _clickWay, starting area at ${loc}`); // eslint-disable-line no-console
      }

      context.perform(
        actionAddEntity(node),
        actionAddEntity(way),
        actionAddVertex(way.id, node.id),
        this._actionClose(way.id),
        actionAddMidpoint({ loc: loc, edge: edge }, node),
        // Up to this point, all we've done is created a two-node area at the midpoint we just added to the existing way.
        // Let's add the draw node.
        actionAddEntity(drawNode),
        actionAddVertex(this.drawWay.id, this.drawNode.id, 1), // Add draw node to draw way
      );

      this.firstNode = context.entity(node.id); // Refresh first node
      this.drawWay = context.entity(this.drawWay.id); // Refresh draw way
      this.drawNode = context.entity(this.drawNode.id); // Refresh draw node
      this.lastNode = this.drawNode;

      scene.classData('osm', this.firstNode.id, 'drawing');
      scene.classData('osm', this.drawWay.id, 'drawing');
      scene.classData('osm', this.drawNode.id, 'drawing');
    }
  }

  /**
   * _clickNode
   * Clicked on an existing node, include that node in the area we are drawing.
   */
  _clickNode(loc, targetNode) {
    const EPSILON = 1e-6;
    const context = this.context;
    const scene = context.scene();
    context.pauseChangeDispatch();



    if (this.drawWay) {
      // The target node needs to be inserted "before" the draw node
      // If draw node is at the beginning, insert target 1 after beginning.
      // If draw node is at the end, insert target 1 before the end.
      const targetIndex =
      this.drawWay?.affix(this.drawNode.id) === 'prefix'
        ? 1
        : this.drawWay.nodes.length - 1;

      // Clicked on first or last node, try to finish the area
      if (
        targetNode.id === this.lastNode.id ||
        targetNode.id === this.firstNode.id ||
        vecEqual(loc, this.lastNode.loc, EPSILON) ||
        vecEqual(loc, this.firstNode.loc, EPSILON)
      ) {
        context.replace(
          this._actionRemoveDrawNode(this.drawWay.id, this.drawNode),
          this._getAnnotation()
        );
        this.drawWay = context.entity(this.drawWay.id);
        this._finish();
        return;
      }

      if (DEBUG) {
        console.log(`ModeDrawArea: _clickNode, extending line to ${targetNode.id}`); // eslint-disable-line no-console
      }

      this.lastNode = targetNode;

      const oldDrawNode = this.drawNode;
      this.drawNode = osmNode({ loc: loc });

      context.perform(
        actionAddEntity(this.drawNode),
        this._actionReplaceDrawNode(
          this.drawWay.id,
          oldDrawNode,
          targetNode,
          targetIndex
        ),
        actionAddVertex(this.drawWay.id, this.drawNode.id, targetIndex), // Add draw node to draw way
        this._getAnnotation()
      );
      this.drawWay = context.entity(this.drawWay.id);
    } else {
      if (DEBUG) {
        console.log(`ModeDrawArea: _clickNode, starting line at ${targetNode.id}`); // eslint-disable-line no-console
      }

      const context = this.context;

      this.firstNode = targetNode;
      this.lastNode = this.firstNode;
      this.drawNode = osmNode({ loc: loc });
      this.drawWay = osmWay({
        tags: this.defaultTags,
        nodes: [this.firstNode.id, this.drawNode.id],
      });

      scene.classData('osm', this.drawWay.id, 'drawing');
      scene.classData('osm', this.firstNode.id, 'drawing');
      scene.classData('osm', this.drawNode.id, 'drawing');

      context.perform(
        actionAddEntity(this.drawNode),
        actionAddEntity(this.firstNode),
        actionAddEntity(this.drawWay),
        this._actionClose(this.drawWay.id)
        //No annotation at this point- having an area with a single node location would be pretty weird.
      );
      this.drawWay = context.entity(this.drawWay.id); // Refresh draw way
      // Perform a no-op edit that will be replaced as the user moves the draw node around.
      context.perform(actionNoop(), this._getAnnotation());
    }

    context.resumeChangeDispatch();
  }

  /**
   * _drawAreaValid
   * True if the draw area is valid, false if not
   */
  _drawAreaValid() {
    if (!this.drawWay) return false;
    if (this.drawWay.isDegenerate()) return false;
    return true;
  }

  _removeDrawNode() {
    if (this.drawNode) {
      // the draw node has already been added to history- so just back it out.
      this.context.pop();
    }
    this.drawNode = null;
  }


  /**
   * _finish
   * Done drawing, select the draw way or return to browse mode.
   * Note that `exit()` will be called immediately after this to perform cleanup.
   */
  _finish() {
    const context = this.context;
    this._removeDrawNode();
    context.resumeChangeDispatch(); // it's possible to get here in a paused state
    // We're done drawing, so ensure that we don't keep the hovered class on things.
    context.scene().clearClass('drawing');

    if (this.drawWay) {
      if (DEBUG) {
        console.log(`ModeDrawArea: _finish, drawWay = ${this.drawWay.id}`); // eslint-disable-line no-console
      }
      context.enter(modeSelect(context, [this.drawWay.id]).newFeature(true));
    } else {
      if (DEBUG) {
        console.log(`ModeDrawArea: _finish, no drawWay`); // eslint-disable-line no-console
      }
      context.enter('browse');
    }
  }

  /**
   * _undo
   * Rollback to the initial checkpoint then return to browse mode
   * Note that `exit()` will be called immediately after this to perform cleanup.
   */
  _undo() {
    if (DEBUG) {
      console.log(`ModeDrawArea: _undo`); // eslint-disable-line no-console
    }
    this.drawWay = null; // this will trigger a rollback
    this.context.enter('browse');
  }
}
