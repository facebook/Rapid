import { vecEqual } from '@id-sdk/math';
import { AbstractMode } from './AbstractMode';

import { actionAddEntity } from '../actions/add_entity';
import { actionAddMidpoint } from '../actions/add_midpoint';
import { actionAddVertex } from '../actions/add_vertex';
import { actionMoveNode } from '../actions/move_node';
import { modeSelect } from '../modes/select';
import { actionDeleteNode } from '../actions/delete_node';
import { actionNoop } from '../actions/noop';

import { modeDrawArea } from './draw_area';
import { locationManager } from '../core/locations';
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
    this._cancel = this._cancel.bind(this);
    this._move = this._move.bind(this);
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

    context.enableBehaviors(['hover', 'draw']);
    context.map().dblclickZoomEnable(false);
    context.behaviors
      .get('draw')
      .on('move', this._move)
      .on('click', this._click)
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
      console.log('ModeDrawArea: exiting'); // eslint-disable-line no-console
    }

    const context = this.context;
    this._active = false;

    window.setTimeout(() => context.map().dblclickZoomEnable(true), 1000);

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
   */
  _actionClose(wayId) {
    return function (graph) {
      return graph.replace(graph.entity(wayId).close());
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

    // Allow snapping only for OSM Entities in the actual graph (i.e. not RapiD features)
    const datum = eventData.data;
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
      const choice = geoChooseEdge(
        graph.childNodes(entity),
        coord,
        projection,
        activeID
      );
      if (choice) {
        const edge = [
          entity.nodes[choice.index - 1],
          entity.nodes[choice.index],
        ];
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
    context.pauseChangeDispatch();
    const EPSILON = 1e-6;
    const renderer = context.map().renderer();

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

      context.replace(
        actionMoveNode(this.lastNode.id, loc) // Finalize position of old draw node at `loc`
      );
      context.perform(
        actionAddEntity(this.drawNode), // Create new draw node
        actionAddVertex(this.drawWay.id, this.drawNode.id, this._insertIndex), // Add new draw node to draw way
        this._getAnnotation() // Allow undo/redo to here
      );

      // Add this new node to the 'drawing' features set
      renderer.scene.drawingFeatures([...renderer.scene.drawing, this.drawNode.id]);

      // Start a brand new area at 'loc'
    } else {
      if (DEBUG) {
        console.log(`ModeDrawArea: _clickLoc, starting area at ${loc}`); // eslint-disable-line no-console
      }

      this.firstNode = osmNode({ loc: loc });
      this.lastNode = this.firstNode;
      this.drawNode = osmNode({ loc: loc });
      this.drawWay = osmWay({ tags: this.defaultTags, nodes: [this.firstNode.id, this.drawNode.id] });

      renderer.scene.drawingFeatures([
        this.drawWay.id,
        this.firstNode.id,
        this.drawNode.id,
      ]);

      context.perform(
        actionAddEntity(this.drawNode),
        actionAddEntity(this.firstNode),
        actionAddEntity(this.drawWay),
        actionAddVertex(this.drawWay.id, this.firstNode.id),
        actionAddVertex(this.drawWay.id, this.drawNode.id),
        this._actionClose(this.drawWay.id),
        this._getAnnotation()
      );
    }

    this.drawWay = context.entity(this.drawWay.id);
    this._updateCollections();

    // Perform a no-op edit that will be replaced as the user moves the draw node around.
    context.perform(actionNoop());
    context.resumeChangeDispatch();
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
    const datum = eventData.data;
    const entity = datum && graph.hasEntity(datum.id);

    // Snap to a node
    if (entity && entity.type === 'node') {
      loc = entity.loc;

      // Snap to a way
    } else if (entity && entity.type === 'way') {
      const activeIDs = context.activeIDs();
      const activeID = activeIDs.length ? activeIDs[0] : undefined; // get the first one, if any
      const choice = geoChooseEdge(
        graph.childNodes(entity),
        coord,
        projection,
        activeID
      );
      if (choice) {
        loc = choice.loc;
      }
    }

    context.replace(actionMoveNode(this.drawNode.id, loc));

    this.drawWay = context.entity(this.drawWay.id);
    this._updateCollections();
  }

  /**
   * _clickWay
   * Clicked on an existing way, add a midpoint along the `edge` at given `loc` and start area from there
   */
  _clickWay(loc, edge) {
    const context = this.context;
    const startGraph = context.graph();
    const node = osmNode({ loc: loc });
    const way = osmWay({ tags: this.defaultTags });
    const renderer = context.map().renderer();

    this.drawWay = way;
    this.lastNode = node;
    this.firstNode = node;
    if (DEBUG) {
      console.log(`ModeDrawArea: _clickWay, starting area at ${loc}`); // eslint-disable-line no-console
    }

    context.perform(
      actionAddEntity(node),
      actionAddEntity(way),
      actionAddVertex(way.id, node.id),
      this._actionClose(way.id),
      actionAddMidpoint({ loc: loc, edge: edge }, node)
    );

      renderer.scene.drawingFeatures([
        node.id,
        way.id,
      ]);
  }

  /**
   * _clickNode
   * Clicked on an existing node, start new area from there.
   */
  _clickNode(loc, node) {
    const context = this.context;
    const startGraph = context.graph();
    const way = osmWay({ tags: this.defaultTags });

    context.perform(
      actionAddEntity(way),
      actionAddVertex(way.id, node.id),
      this._actionClose(way.id)
    );

    const renderer = context.map().renderer();
    renderer.scene.drawingFeatures([way.id]);
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

  /**
   * _cancel
   * Return to browse mode immediately, `exit()` will handle cleanup
   */
  _cancel() {
    this.context.enter('browse');
  }

  /**
   * _finish
   * Done drawing, select the draw way or return to browse mode.
   * Note that `exit()` will be called immediately after this to perform cleanup.
   */
  _finish() {
    const context = this.context;
    context.resumeChangeDispatch(); // it's possible to get here in a paused state

    const renderer = context.map().renderer();
    renderer.scene.drawingFeatures([]); // No longer drawing features! Clear this data.

    if (this.drawWay) {
      if (DEBUG) {
        console.log(`ModeDrawArea: _finish, drawWay = ${this.drawWay.id}`); // eslint-disable-line no-console
      }
      context.enter(modeSelect(context, [this.drawWay.id])); //.newFeature(isNewFeature));
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
