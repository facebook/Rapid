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
 * `ModeAddLine`
 * In this mode we are drawing a new line or continuing an existing line
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

    this.drawNode = null;  // The Draw Node is temporary and just follows the mouse pointer.
    this.drawWay = null;   // The Draw Way just contains the way that we are drawing.

    // _insertIndex determines whether new nodes go to the beginning or end of the line
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
   * activeID
   * The id of the draw node should be considered "active", i.e. not generate interactive events
   */
  get activeID() {
    return this.drawNode ? this.drawNode.id : null;
  }
  /**
   * selectedIDs
   * The id of the drawWay
   */
  get selectedIDs() {
    return this.drawWay ? [this.drawWay.id] : [];
  }


  /**
   * enter
   * @param   `selectedData`  `Map(dataID -> data)`
   */
  enter(selectedData) {
    // If selectedData contains a Node and a Way, continue a line from there.
    let continueNode, continueWay;
    if (selectedData instanceof Map && selectedData.size === 2) {
      for (const datum of selectedData.values()) {
        if (datum instanceof osmWay) {
          continueWay = datum;
        } else if (datum instanceof osmNode) {
          continueNode = datum;
        }
      }
      if (!continueNode && !continueWay) return;  // bail out

      // going forward, the selection will contain only the drawing way.
      this.selectedData = new Map().set(continueWay.id, continueWay);

      if (DEBUG) {
        console.log(`ModeAddLine: entering, continuing line ${continueWay.id}`);  // eslint-disable-line no-console
      }

    } else {    // Start a new line
      this.selectedData = new Map();
      if (DEBUG) {
        console.log('ModeAddLine: entering');  // eslint-disable-line no-console
      }
    }

    const context = this._context;
    this._active = true;
    this.drawNode = null;
    this.drawWay = null;
    this._insertIndex = undefined;

    context.history().checkpoint('add-line-initial');  // save history checkpoint to return to if things go bad

    if (continueNode && continueWay) {
      const affix = continueWay.affix(continueNode.id);
      this._insertIndex = (affix === 'prefix' ?  0 : undefined);
      this.drawWay = continueWay;
      this._continueFromNode(continueNode);  // create draw node and extend continue way to it
    }

    context.map().dblclickZoomEnable(false);
    context.enableBehaviors(['hover', 'draw']);
    context.behaviors.get('draw')
      .on('move', this._move)
      .on('click', this._click)
      .on('clickWay', this._clickWay)
      .on('clickNode', this._clickNode)
      .on('cancel', this._cancel)
      .on('finish', this._finish);

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

    const context = this._context;
    this._active = false;

    // If there is a temporary draw node, remove it.
    if (this.drawNode) {
      context.replace(actionDeleteNode(this.drawNode.id));
    }

    // Confirm that the drawn way exists and is valid..
    if (!this.drawWay || this.drawWay.isDegenerate()) {
      context.history().reset('add-line-initial');   // rollback to checkpoint
    }

    this.selectedData = new Map();
    this.drawNode = null;
    this.drawWay = null;
    this._insertIndex = undefined;

    window.setTimeout(() => context.map().dblclickZoomEnable(true), 1000);

    context.behaviors.get('draw')
      .on('move', null)
      .on('click', null)
      .on('clickWay', null)
      .on('clickNode', null)
      .on('cancel', null)
      .on('finish', null);
  }


  /**
   * _getAnnotation
   * An annotation is a text associated with the edit, such as "Started a line".
   * The edits on the history stack with annotations are the ones we can undo/redo back to.
   */
  _getAnnotation() {
    const which = this.drawWay ? 'continue' : 'start';
    return t(`operations.${which}.annotation.line`);
  }


  /**
   * _move
   * Move the draw node, if any.
   */
  _move(eventData) {
    if (!this.drawNode) return;

    const context = this._context;
    const loc = context.projection.invert(eventData.coord);
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

    context.replace(actionMoveNode(this.drawNode.id, loc));
    this.drawNode = context.entity(this.drawNode.id);
  }


  /**
   * _click
   * Clicked on nothing, create a point at given `loc`.
   */
  _click(loc) {
    const context = this._context;

    // Extend draw way, add vertex at `loc`...
    if (this.drawWay) {
      if (DEBUG) {
        console.log(`ModeAddLine: _click, extending line to ${loc}`);  // eslint-disable-line no-console
      }
      const newDrawNode = osmNode({ loc: loc });
      context.replace(
        actionMoveNode(this.drawNode.id, loc),                                  // Finalize position of old draw node at `loc`
        actionAddEntity(newDrawNode),                                           // Create new draw node
        actionAddVertex(this.drawWay.id, newDrawNode.id, this._insertIndex),    // Add new draw node to draw way
        this._getAnnotation()
      );

      this.drawNode = context.entity(newDrawNode.id);   // Replace draw node
      this.drawWay = context.entity(this.drawWay.id);   // Replace draw way

    // Start a new draw way at `loc`...
    } else {
      if (DEBUG) {
        console.log(`ModeAddLine: _click, starting line at ${loc}`);  // eslint-disable-line no-console
      }
      const startNode = osmNode({ loc: loc });
      this.drawNode = osmNode({ loc: loc });
      this.drawWay = osmWay({ tags: this.defaultTags, nodes: [ startNode.id, this.drawNode.id ] });

      context.perform(
        actionAddEntity(startNode),      // Create start node
        actionAddEntity(this.drawNode),  // Create new draw node (end)
        actionAddEntity(this.drawWay),   // Create new draw way
        this._getAnnotation()
      );
    }

    // Perform a no-op edit that will be replaced as the user moves the draw node around.
    context.perform(actionNoop());

    // Refresh selection
    this.selectedData.set(this.drawWay.id, this.drawWay);
  }


  /**
   * _clickWay
   * Clicked on an target way, add a midpoint along the `edge` at given `loc`.
   */
  _clickWay(loc, edge) {
    const context = this._context;
    const midpoint = { loc: loc, edge: edge };

    // Extend draw way, add vertex at midpoint on target edge...
    if (this.drawWay) {
      if (DEBUG) {
        console.log(`ModeAddLine: _clickWay, extending line to edge ${edge}`);  // eslint-disable-line no-console
      }
      const newDrawNode = osmNode({ loc: loc });

      context.replace(
        actionMoveNode(this.drawNode.id, loc),                                 // Finalize position of old draw node at `loc`
        actionAddMidpoint(midpoint, this.drawNode),                            // Add old draw node as a midpoint on target edge
        actionAddEntity(newDrawNode),                                          // Create new draw node
        actionAddVertex(this.drawWay.id, newDrawNode.id, this._insertIndex),   // Add new draw node to draw way
        this._getAnnotation()
      );

      this.drawNode = context.entity(newDrawNode.id);   // Replace draw node
      this.drawWay = context.entity(this.drawWay.id);   // Replace draw way

    // Start a new draw way at `loc` on target edge...
    } else {
      if (DEBUG) {
        console.log(`ModeAddLine: _clickWay, starting line at edge ${edge}`);  // eslint-disable-line no-console
      }
      const startNode = osmNode({ loc: loc });
      this.drawNode = osmNode({ loc: loc });
      this.drawWay = osmWay({ tags: this.defaultTags, nodes: [ startNode.id, this.drawNode.id ] });

      context.perform(
        actionAddEntity(startNode),              // Create start node
        actionAddEntity(this.drawNode),          // Create new draw node (end)
        actionAddEntity(this.drawWay),           // Create new draw way
        actionAddMidpoint(midpoint, startNode),  // Add start node as midpoint on target edge
        this._getAnnotation()
      );
    }

    // Perform a no-op edit that will be replaced as the user moves the draw node around.
    context.perform(actionNoop());

    // Refresh selection
    this.selectedData.set(this.drawWay.id, this.drawWay);
  }


  /**
   * _clickNode
   * Clicked on a target node, include that node in the line we are drawing.
   */
  _clickNode(loc, targetNode) {
    const context = this._context;

    // Extend draw way, reuse target node as a vertex...
    // (Note that we don't need to replace the draw node in this scenerio)
    if (this.drawWay) {
      if (DEBUG) {
        console.log(`ModeAddLine: _clickNode, extending line to ${targetNode.id}`);  // eslint-disable-line no-console
      }
      // The target node needs to be inserted "before" the draw node
      // If draw node is at the beginning, insert target 1 after beginning.
      // If draw node is at the end, insert target 1 before the end.
      const targetIndex = this.drawWay.affix(this.drawNode.id) === 'prefix' ? 1 : this.drawWay.nodes.length - 2;

      context.replace(
        actionAddVertex(this.drawWay.id, targetNode.id, targetIndex),   // Add target node to draw way
        this._getAnnotation()
      );

      this.drawWay = context.entity(this.drawWay.id);   // Refresh draw way

    // Start a new draw way at target node...
    } else {
      if (DEBUG) {
        console.log(`ModeAddLine: _clickNode, starting line at ${targetNode.id}`);  // eslint-disable-line no-console
      }

      this.drawNode = osmNode({ loc: loc });
      this.drawWay = osmWay({ tags: this.defaultTags, nodes: [ targetNode.id, this.drawNode.id ] });

      context.perform(
        actionAddEntity(this.drawNode),   // Create new draw node (end)
        actionAddEntity(this.drawWay),    // Create new draw way
        this._getAnnotation()
      );
    }

    // Perform a no-op edit that will be replaced as the user moves the draw node around.
    context.perform(actionNoop());

    // Refresh selection
    this.selectedData.set(this.drawWay.id, this.drawWay);
  }


  /**
   * _continueFromNode
   * We're entering this mode with the target node and draw way already selected
   * i.e. Continuing from the end of an existing way
   */
  _continueFromNode(targetNode) {
    const context = this._context;

    if (DEBUG) {
      console.log(`ModeAddLine: _continueFromNode, continuing line at ${targetNode.id}`);  // eslint-disable-line no-console
    }

    this.drawNode = osmNode({ loc: targetNode.loc });

    context.perform(
      actionAddEntity(this.drawNode),                                          // Create new draw node
      actionAddVertex(this.drawWay.id, this.drawNode.id, this._insertIndex),   // Add draw node to draw way
      this._getAnnotation()
    );

    this.drawWay = context.entity(this.drawWay.id);   // Refresh draw way

    // Perform a no-op edit that will be replaced as the user moves the draw node around.
    context.perform(actionNoop());

    // Refresh draw way and selection
    this.selectedData.set(this.drawWay.id, this.drawWay);
  }


  /**
   * _finish
   * Done drawing, select the draw way or return to browse mode.
   * Note that `exit()` will be called immediately after this to perform cleanup.
   */
  _finish() {
    const context = this._context;
    if (this.drawWay) {
      if (DEBUG) {
        console.log(`ModeAddLine: _finish, drawWay = ${this.drawWay.id}`);  // eslint-disable-line no-console
      }
      context.enter(modeSelect(context, [this.drawWay.id]));  //.newFeature(isNewFeature));
    } else {
      if (DEBUG) {
        console.log(`ModeAddLine: _finish, no drawWay`);  // eslint-disable-line no-console
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
      console.log(`ModeAddLine: _cancel`);  // eslint-disable-line no-console
    }
    this.drawWay = null;   // this will trigger a rollback
    this._context.enter('browse');
  }

}
