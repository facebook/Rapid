import { vecEqual } from '@id-sdk/math';

import { AbstractMode } from './AbstractMode';

import { actionAddEntity } from '../actions/add_entity';
import { actionAddMidpoint } from '../actions/add_midpoint';
import { actionAddVertex } from '../actions/add_vertex';
import { actionDeleteNode } from '../actions/delete_node';
import { actionMoveNode } from '../actions/move_node';
import { actionNoop } from '../actions/noop';

import { geoChooseEdge } from '../geo';
import { locationManager } from '../core/LocationManager';
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
    this._clicks = 0;

    // Make sure the event handlers have `this` bound correctly
    this._move = this._move.bind(this);
    this._click = this._click.bind(this);
    this._undo = this._undo.bind(this);
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
    const scene = this.context.scene();

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
    this._clicks = 0;
    this._selectedData.clear();

    context.history().checkpoint('draw-line-initial');  // save history checkpoint to return to if things go bad

    if (continueNode && continueWay) {
      const continueFromStart = (continueWay.affix(continueNode.id) === 'prefix');
      const oppositeNodeID = (continueFromStart ? continueWay.last() : continueWay.first());
      this._insertIndex = (continueFromStart ? 0 : undefined);
      this.lastNode = continueNode;
      this.firstNode = context.entity(oppositeNodeID);
      this.drawWay = continueWay;

      // Add the way to the 'drawing' features set
      scene.classData('osm', continueWay.id, 'drawing');

      // this._selectedData.set(this.drawWay.id, this.drawWay);
      this._updateCollections();

      this._continueFromNode(continueNode);  // create draw node and extend continue way to it
    }

    context.enableBehaviors(['hover', 'draw', 'map-interaction', 'map-nudging']);

    context.behaviors.get('draw')
      .on('move', this._move)
      .on('click', this._click)
      .on('undo', this._undo)
      .on('finish', this._finish);

    context.behaviors.get('map-interaction').doubleClickEnabled = false;

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
    this._clicks = 0;
    this._selectedData.clear();

    window.setTimeout(() => {
      context.behaviors.get('map-interaction').doubleClickEnabled = true;
    }, 1000);

    context.behaviors.get('draw')
      .off('move', this._move)
      .off('click', this._click)
      .off('undo', this._undo)
      .off('finish', this._finish);
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
    const which = (this._clicks > 1 ? 'continue' : 'start');
    return t(`operations.${which}.annotation.line`);
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
      const activeID = activeIDs.length ? activeIDs[0] : undefined;  // get the first one, if any
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
      const activeID = activeIDs.length ? activeIDs[0] : undefined;  // get the first one, if any
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
   * Clicked on nothing, create a point at given `loc`.
   */
  _clickLoc(loc) {
    const EPSILON = 1e-6;
    const context = this.context;
    const scene = context.scene();
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
        console.log(`ModeDrawLine: _clickLoc, extending line to ${loc}`);  // eslint-disable-line no-console
      }

      // Replace draw node
      this.lastNode = this.drawNode;
      this.drawNode = osmNode({ loc: loc });

      context.perform(
        actionAddEntity(this.drawNode), // Create new draw node
        actionAddVertex(this.drawWay.id, this.drawNode.id, this._insertIndex),  // Add new draw node to draw way
        this._getAnnotation() // Allow undo/redo to here
      );

      this.lastNode = context.entity(this.lastNode.id);
      this.drawWay = context.entity(this.drawWay.id);

    // Start a new line at `loc`...
    } else {
      if (DEBUG) {
        console.log(`ModeDrawLine: _clickLoc, starting line at ${loc}`);  // eslint-disable-line no-console
      }
      this.firstNode = osmNode({ loc: loc });
      this.lastNode = this.firstNode;
      this.drawNode = osmNode({ loc: loc });
      this.drawWay = osmWay({ tags: this.defaultTags, nodes: [ this.firstNode.id, this.drawNode.id ] });
      scene.classData('osm', this.drawWay.id, 'drawing');
      //  scene.classData('osm', this.firstNode.id, 'drawing');
       scene.classData('osm', this.drawNode.id, 'drawing');

      context.perform(
        actionAddEntity(this.firstNode),  // Create first node
        actionAddEntity(this.drawNode),   // Create new draw node (end)
        actionAddEntity(this.drawWay),    // Create new draw way
      );
    // Perform a no-op edit that will be replaced as the user moves the draw node around.
    context.perform(actionNoop(), this._getAnnotation());

    }

    context.resumeChangeDispatch();

    this.drawWay = context.entity(this.drawWay.id);   // Refresh draw way
    this._updateCollections();
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

    // Extend line by adding vertex at midpoint on target edge...
    if (this.drawWay) {
      // The drawNode is at the start or end node, try to finish the line.
      // (Normally this situation would be caught in `_clickNode`, maybe the user held down modifier key?)
      if (vecEqual(loc, this.lastNode.loc, EPSILON) || vecEqual(loc, this.firstNode.loc, EPSILON)) {
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
        actionAddMidpoint(midpoint, this.lastNode)   // Add old draw node as a midpoint on target edge
      );
      context.perform(
        actionAddEntity(this.drawNode),                                          // Create new draw node
        actionAddVertex(this.drawWay.id, this.drawNode.id, this._insertIndex),   // Add new draw node to draw way
        this._getAnnotation()                                                    // Allow undo/redo to here
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
        actionAddMidpoint(midpoint, this.firstNode),  // Add first node as midpoint on target edge
      );
    }

    this.drawWay = context.entity(this.drawWay.id);   // Refresh draw way
    this._updateCollections();

    // Perform a no-op edit that will be replaced as the user moves the draw node around.
    context.perform(actionNoop(), this._getAnnotation());
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

    // Extend line by reuse target node as a vertex...
    // (Note that we don't need to replace the draw node in this scenerio)
    if (this.drawWay) {
      // Clicked on first or last node, try to finish the line
      if (targetNode === this.lastNode || targetNode === this.firstNode ||
        vecEqual(loc, this.lastNode.loc, EPSILON) || vecEqual(loc, this.firstNode.loc, EPSILON)
      ) {
        const targetIndex = this.drawWay.affix(this.drawNode.id) === 'prefix'? 1 : this.drawWay.nodes.length - 1;

        context.replace(
          this._actionRemoveDrawNode(this.drawWay.id, this.drawNode),
          actionAddVertex(this.drawWay.id, targetNode.id, targetIndex), // Add target node to draw way
          this._getAnnotation()
        );

        if (targetNode === this.firstNode) {
          this.drawNode = null;
        }

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
      const targetIndex = this.drawWay.affix(this.drawNode.id) === 'prefix' ? 1 : this.drawWay.nodes.length - 1;

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
        actionAddEntity(this.drawWay),    // Create new draw way
      );

      context.scene().classData('osm', this.drawWay.id, 'drawing');

    }

    this.drawWay = context.entity(this.drawWay.id);   // Refresh draw way
    this._updateCollections();

    // Perform a no-op edit that will be replaced as the user moves the draw node around.
    context.perform(actionNoop(), this._getAnnotation());
    context.resumeChangeDispatch();
  }

  _actionRemoveDrawNode(wayId, drawNode) {
    return function (graph) {
      return graph.replace(graph.entity(wayId).removeNode(drawNode.id)).remove(drawNode);
    };
  }

  /**
   * _continueFromNode
   * We're entering this mode with the target node and draw way already selected
   * i.e. Continuing from the start or end of an existing way
   */
  _continueFromNode(targetNode) {
    const context = this.context;
    context.pauseChangeDispatch();

    if (DEBUG) {
      console.log(`ModeDrawLine: _continueFromNode, continuing line at ${targetNode.id}`);  // eslint-disable-line no-console
    }

    this.drawNode = osmNode({ loc: targetNode.loc });

    context.perform(
      actionAddEntity(this.drawNode),                                          // Create new draw node
      actionAddVertex(this.drawWay.id, this.drawNode.id, this._insertIndex),   // Add draw node to draw way
      this._getAnnotation()
    );
    context.scene().classData('osm', this.drawWay.id, 'drawing');

    this.drawWay = context.entity(this.drawWay.id);        // Refresh draw way
    this._updateCollections();

    // Perform a no-op edit that will be replaced as the user moves the draw node around.
    context.perform(actionNoop());
    context.resumeChangeDispatch();
  }


  _removeDrawNode() {

    // In mose cases, we have automatically created a draw node after each click, with a separate history step.
    // In that case, we can simply back it out.
    if (this.drawNode) {
      // the draw node has already been added to history- so just back it out.
      this.context.pop();
    }

    //Special case- the final node that was clicked was an already-existing node, which means that we need to just clean up the draw node, not do anything to history itself.

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
    context.resumeChangeDispatch();  // it's possible to get here in a paused state
    // We're done drawing, so ensure that we don't keep the hovered class on things.
    context.scene().clearClass('drawing');

    if (this.drawWay) {
      if (DEBUG) {
        console.log(`ModeDrawLine: _finish, drawWay = ${this.drawWay.id}`);  // eslint-disable-line no-console
      }
      context.enter(modeSelect(context, [this.drawWay.id]).newFeature(true));

    } else {
      if (DEBUG) {
        console.log(`ModeDrawLine: _finish, no drawWay`);  // eslint-disable-line no-console
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
      console.log(`ModeDrawLine: _undo`);  // eslint-disable-line no-console
    }
    this.drawWay = null;   // this will trigger a rollback
    this.context.enter('browse');
  }

}
