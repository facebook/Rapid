import { select as d3_select } from 'd3-selection';
import { polygonHull as d3_polygonHull, polygonCentroid as d3_polygonCentroid } from 'd3-polygon';
import { DEG2RAD, vecInterp, vecRotate } from '@rapid-sdk/math';
import { utilArrayIdentical, utilGetAllNodes } from '@rapid-sdk/util';

import { AbstractMode } from './AbstractMode.js';
import { actionDeleteRelation } from '../actions/delete_relation.js';
import { actionMove, actionRotate } from '../actions/index.js';
import * as Operations from '../operations/index.js';
import { uiCmd } from '../ui/cmd.js';
import { utilKeybinding, utilTotalExtent } from '../util/index.js';


/**
 * `SelectOsmMode`
 * In this mode, the user has selected one or more OSM features.
 *
 * For a while we needed to keep the old `modeSelect` around, and we should
 * eventually have a common select mode for everything but this is just my
 * attempt at updating the legacy osm-only select mode for now.
 */
export class SelectOsmMode extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'select-osm';

    this.keybinding = null;
    this.extent = null;

    this._newFeature = false;

    // `this._focusedParentID` is used when we visit a vertex with multiple
    // parents, and we want to remember which parent line we started on.
    this._focusedParentID = null;

    this._singularDatum = null;   // If we have a single thing selected, keep track of it here
    this._lastSelectedIDs = [];   // Previous selection, used by arrow key handler

    // Make sure the event handlers have `this` bound correctly
    this._keydown = this._keydown.bind(this);
    this._hover = this._hover.bind(this);
    this._merge = this._merge.bind(this);

    this._firstVertex = this._firstVertex.bind(this);
    this._focusNextParent = this._focusNextParent.bind(this);
    this._lastVertex = this._lastVertex.bind(this);
    this._nextVertex = this._nextVertex.bind(this);
    this._previousVertex = this._previousVertex.bind(this);
    this._hover = this._hover.bind(this);
  }


  /**
   * enter
   * Enters the mode.
   * @param  {Object?}  options - Optional `Object` of options passed to the new mode
   * @param  {Object}   options.selection - An object where the keys are layerIDs
   *    and the values are Arrays of dataIDs:  Example:  `{ 'osm': ['w1', 'w2', 'w3'] }`
   * @param  {boolean}  options.newFeature - `true` if this is a new feature
   * @return {boolean}  `true` if the mode can be entered, `false` if not
   */
  enter(options = {}) {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const filters = context.systems.filters;
    const hover = context.behaviors.hover;
    const locations = context.systems.locations;
    const map = context.systems.map;
    const ui = context.systems.ui;
    const urlhash = context.systems.urlhash;
    const eventManager = map.renderer.events;

    const selection = options.selection ?? {};
    let entityIDs = selection.osm ?? [];
    this._newFeature = options.newFeature;

    // Gather valid entities and entityIDs from selection.
    // For this mode, keep only the OSM data.
    this._selectedData = new Map();
    this._singularDatum = null;
    this._lastSelectedIDs = [];
    this._focusedParentID = options.focusedParentID;

    for (const entityID of entityIDs) {
      const entity = graph.hasEntity(entityID);
      if (!entity) continue;   // not in the osm graph
      if (entity.type === 'node' && locations.blocksAt(entity.loc).length) continue;  // editing is blocked

      this._selectedData.set(entityID, entity);

      if (entityIDs.length === 1) {
        this._singularDatum = entity;  // if a single thing is selected
      }
    }

    if (!this._selectedData.size) return false;  // found nothing to select
    entityIDs = [...this._selectedData.keys()];  // the entities we ended up keeping

    this._active = true;

    context.enableBehaviors(['hover', 'select', 'drag', 'mapInteraction', 'lasso', 'paste']);
    ui.closeEditMenu();

    this.extent = utilTotalExtent(entityIDs, graph);  // Compute the total extent of selected items
    urlhash.setParam('id', entityIDs.join(','));      // Put entityIDs into the url hash
    filters.forceVisible(entityIDs);                  // Exclude entityIDs from being filtered
    this._setupOperations(entityIDs);                 // Determine available operations on the edit menu

    this.keybinding = utilKeybinding('select');
    this.keybinding
      .on(['[', 'pgup'], this._previousVertex)
      .on([']', 'pgdown'], this._nextVertex)
      .on(['{', uiCmd('⌘['), 'home'], this._firstVertex)
      .on(['}', uiCmd('⌘]'), 'end'], this._lastVertex)
      .on(['\\', 'pause'], this._focusNextParent);

    d3_select(document)
      .call(this.keybinding);

    eventManager.on('keydown', this._keydown);
    editor.on('merge', this._merge);
    hover.on('hoverchange', this._hover);

    ui.sidebar
      .select(entityIDs, this._newFeature);

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    const context = this.context;
    const editor = context.systems.editor;
    const filters = context.systems.filters;
    const hover = context.behaviors.hover;
    const l10n = context.systems.l10n;
    const map = context.systems.map;
    const ui = context.systems.ui;
    const urlhash = context.systems.urlhash;
    const eventManager = map.renderer.events;

    // If the user added an empty relation, we should clean it up.
    const graph = editor.staging.graph;
    const entity = graph.hasEntity(this._singularDatum?.id);
    if (
      entity?.type === 'relation' &&
      Object.keys(entity.tags).length === 0 &&        // no tags
      graph.parentRelations(entity).length === 0 &&   // no parent relations
      // no members or one member with no role
      (entity.members.length === 0 || (entity.members.length === 1 && !entity.members[0].role))
    ) {
      // The user added this relation but didn't edit it at all, so just delete it
      editor.perform(actionDeleteRelation(entity.id, true));  // true = don't delete untagged members
      editor.commit({
        annotation: l10n.t('operations.delete.annotation.relation'),
        selectedIDs: [entity.id]
      });
    }

    this.extent = null;
    this._newFeature = false;
    this._singularDatum = null;
    this._selectedData.clear();
    this._lastSelectedIDs = [];

    // disable operations
    for (const operation of this.operations) {
      if (operation.behavior) {
        operation.behavior.disable();
      }
    }
    this.operations = [];

    ui.closeEditMenu();
    ui.sidebar.hide();
    urlhash.setParam('id', null);
    filters.forceVisible([]);

    if (this.keybinding) {
      d3_select(document).call(this.keybinding.unbind);
      this.keybinding = null;
    }

    editor.off('merge', this._merge);
    eventManager.off('keydown', this._keydown);
    hover.off('hoverchange', this._hover);
  }


  /**
   * _keydown
   * Handler for keydown events on the window.
   * @param  `e`  A DOM KeyboardEvent
   */
  _keydown(e) {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const ui = context.systems.ui;
    const viewport = context.viewport;

    // Only match these keys if the user doesn't have something
    // more important focused - like a input, textarea, menu, etc.
    const activeElement = document.activeElement?.tagName ?? 'BODY';
    if (activeElement !== 'BODY') return;
    // Also exit if we have something selected at very low zoom
    if (!context.editable()) return;

    // select parent
    if ((e.altKey || e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') {
      e.preventDefault();
      this._selectParentWays();
      return;

    // select children
    } else if ((e.altKey || e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') {
      e.preventDefault();
      this._selectChildNodes();
      return;
    }

    // Does the user have the same selection and is doing same action as before?
    // If so, use `commitAppend` to avoid creating a new undo state.
    const selectedIDs = [...this._selectedData.keys()];
    const isSameSelection = utilArrayIdentical(selectedIDs, this._lastSelectedIDs);
    if (!isSameSelection) {
      this._lastSelectedIDs = selectedIDs.slice();  // take copy
    }

    let operation, action;

    // rotate
    if (e.shiftKey && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();

      const ROT_AMOUNT = 2 * DEG2RAD;   // ± 2°
      let delta;
      if (e.key === 'ArrowLeft') {
        delta = -ROT_AMOUNT;
      } else if (e.key === 'ArrowRight') {
        delta = ROT_AMOUNT;
      }

      if (delta) {
        // pivot around centroid in projected coordinates [x,y]
        const nodes = utilGetAllNodes(selectedIDs, graph);
        const points = nodes.map(node => viewport.project(node.loc));

        let centroid;
        if (points.length < 2) {
          return;  // no reason to rotate a single point
        } else if (points.length === 2) {
          centroid = vecInterp(points[0], points[1], 0.5);  // average
        } else {
          const polygonHull = d3_polygonHull(points);
          if (polygonHull.length === 2) {
            centroid = vecInterp(points[0], points[1], 0.5);
          } else {
            centroid = d3_polygonCentroid(d3_polygonHull(points));
          }
        }

        operation = Operations.operationRotate(context, selectedIDs);
        action = actionRotate(selectedIDs, centroid, delta, viewport);
      }

    // move
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();

      const MOVE_AMOUNT = 3;   // in pixels
      let delta;
      if (e.key === 'ArrowLeft') {
        delta = [-MOVE_AMOUNT, 0];
      } else if (e.key === 'ArrowRight') {
        delta = [MOVE_AMOUNT, 0];
      } else if (e.key === 'ArrowUp') {
        delta = [0, -MOVE_AMOUNT];
      } else if (e.key === 'ArrowDown') {
        delta = [0, MOVE_AMOUNT];
      }

      if (delta) {
        const t = viewport.transform;
        if (t.r) {
          delta = vecRotate(delta, -t.r, [0, 0]);   // remove any rotation
        }
        operation = Operations.operationMove(context, selectedIDs);
        action = actionMove(selectedIDs, delta, viewport);
      }
    }

    // Is this shape transform allowed?
    if (operation && action) {
      if (!operation.available()) return;

      if (operation.disabled()) {
        ui.flash
          .duration(4000)
          .iconName(`#rapid-operation-${operation.id}`)
          .iconClass('operation disabled')
          .label(operation.tooltip)();

        return;
      }

      // do it
      const annotation = operation.annotation();
      const options = { annotation: annotation, selectedIDs: selectedIDs };

      editor.perform(action);
      if (isSameSelection && editor.getUndoAnnotation() === annotation) {
        editor.commitAppend(options);
      } else {
        editor.commit(options);
      }

      // Update selected/active collections to contain the transformed entities
      const graph2 = editor.staging.graph;  // after transform
      this._selectedData.clear();
      for (const entityID of selectedIDs) {
        this._selectedData.set(entityID, graph2.entity(entityID));
      }

      // Recheck the available operations on menu here.
      // For example, if a user moved the shape off the screen
      // then some of the operations should disable themselves.
      this._setupOperations(selectedIDs);
    }
  }


  /**
   * _merge
   * If we have entities selected already, and we find new versions
   * of them loaded from the server, the `operations` offered on
   * the edit menu may be wrong and should be refreshed. Rapid#1311
   * @param {Set<string>} newIDs - entityIDs recently loaded from OSM
   */
  _merge(newIDs) {
    if (!(newIDs instanceof Set)) return;
    const entityIDs = [...this._selectedData.keys()];

    let needsRefresh = false;
    for (const entityID of entityIDs) {
      if (newIDs.has(entityID)) {
        needsRefresh = true;
        break;
      }
    }

    if (needsRefresh) {
      this._setupOperations(entityIDs);
    }
  }


  /**
   * _setupOperations
   *  Called whenever we have a need to reset the `operations` array.
   *  @param  {Array}  entityIDs - the selected entityIDs
   */
  _setupOperations(entityIDs) {
    const context = this.context;
    const ui = context.systems.ui;

    // disable any that were available before
    for (const operation of this.operations) {
      if (operation.behavior) {
        operation.behavior.disable();
      }
    }

    if (Array.isArray(entityIDs) && entityIDs.length) {
      const order = {  // sort these to the end of the list
        copy: 1,
        downgrade: 2,
        delete: 3
      };

      this.operations = Object.values(Operations)
        .map(op => op(context, entityIDs))
        .filter(op => op.available())
        .sort((a, b) => {
          const aOrder = order[a.id] || 0;
          const bOrder = order[b.id] || 0;
          return aOrder - bOrder;
        });

      // enable all available
      for (const operation of this.operations) {
        if (operation.behavior) {
          operation.behavior.enable();
        }
      }
    }

    // Redraw the menu if it is already shown
    ui.redrawEditMenu();
  }


  /**
   * _chooseParentWay
   *  When using keyboard navigation, try to stay with the previously focused parent way
   *  @param  {Entity} entity - The entity we are checking for parent ways
   */
  _chooseParentWay(entity) {
    if (!entity) return null;

    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;

    if (entity.type === 'way') {     // selected entity already is a way, so just use it.
      this._focusedParentID = entity.id;

    } else {
      const parentIDs = graph.parentWays(entity).map(way => way.id);
      if (!parentIDs.length) {
        this._focusedParentID = null;   // no parents

      } else {
        // We'll try to stick with the already focused parent (e.g. when keyboard navigating along a way).
        // If we can't do that, just pick the first parent to be the new focused parent.
        if (!parentIDs.includes(this._focusedParentID)) {
          this._focusedParentID = parentIDs[0];
        }
      }
    }

    return graph.hasEntity(this._focusedParentID);
  }


  /**
   * _firstVertex
   *  jump to the first vertex along a way
   */
  _firstVertex(d3_event) {
    d3_event.preventDefault();

    const way = this._chooseParentWay(this._singularDatum);
    if (!way) return;

    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const map = context.systems.map;

    const node = graph.entity(way.first());
    context.enter('select-osm', { selection: { osm: [node.id] }} );
    map.centerEase(node.loc);
  }


  /**
   * _lastVertex
   *  jump to the first vertex along a way
   */
  _lastVertex(d3_event) {
    d3_event.preventDefault();

    const way = this._chooseParentWay(this._singularDatum);
    if (!way) return;

    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const map = context.systems.map;

    const node = graph.entity(way.last());
    context.enter('select-osm', { selection: { osm: [node.id] }} );
    map.centerEase(node.loc);
  }


  /**
   * _previousVertex
   *  jump to the previous vertex
   */
  _previousVertex(d3_event) {
    d3_event.preventDefault();

    const entity = this._singularDatum;
    if (entity?.type !== 'node') return;

    const way = this._chooseParentWay(this._singularDatum);
    if (!way) return;

    const currIndex = way.nodes.indexOf(entity.id);
    let nextIndex = -1;

    if (currIndex > 0) {
      nextIndex = currIndex - 1;
    } else if (way.isClosed()) {
      nextIndex = way.nodes.length - 2;
    }

    if (nextIndex !== -1) {
      const context = this.context;
      const editor = context.systems.editor;
      const graph = editor.staging.graph;
      const map = context.systems.map;

      const node = graph.entity(way.nodes[nextIndex]);
      context.enter('select-osm', { selection: { osm: [node.id] }} );
      map.centerEase(node.loc);
    }
  }


  /**
   * _nextVertex
   *  jump to the next vertex
   */
  _nextVertex(d3_event) {
    d3_event.preventDefault();

    const entity = this._singularDatum;
    if (entity?.type !== 'node') return;

    const way = this._chooseParentWay(this._singularDatum);
    if (!way) return;

    const currIndex = way.nodes.indexOf(entity.id);
    let nextIndex = -1;

    if (currIndex < way.nodes.length - 1) {
      nextIndex = currIndex + 1;
    } else if (way.isClosed()) {
      nextIndex = 0;
    }

    if (nextIndex !== -1) {
      const context = this.context;
      const editor = context.systems.editor;
      const graph = editor.staging.graph;
      const map = context.systems.map;

      const node = graph.entity(way.nodes[nextIndex]);
      context.enter('select-osm', { selection: { osm: [node.id] }} );
      map.centerEase(node.loc);
    }
  }


  /**
   * _focusNextParent
   *  If the user is at a junction, focus on a different parent way
   */
  _focusNextParent(d3_event) {
    d3_event.preventDefault();

    const entity = this._singularDatum;
    if (entity?.type !== 'node') return;

    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const parentIDs = graph.parentWays(entity).map(way => way.id);

    if (parentIDs.length) {
      const currIndex = parentIDs.indexOf(this._focusedParentID);  // -1 if not found
      let nextIndex = currIndex + 1;
      if (nextIndex >= parentIDs.length) {
        nextIndex = 0;  // wrap
      }

      this._focusedParentID = parentIDs[nextIndex];
    }

// won't work
//    var surface = context.surface();
//    surface.selectAll('.related')
//        .classed('related', false);
//
//    if (this._focusedParentID) {
//        surface.selectAll(utilEntitySelector([this._focusedParentID]))
//            .classed('related', true);
//    }
  }


  /**
   * _selectParentWay
   */
  _selectParentWays() {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const parentWayIDs = new Set();

    for (const entity of this._selectedData.values()) {
      if (entity.type !== 'node') continue;

      for (const way of graph.parentWays(entity)) {
        parentWayIDs.add(way.id);
      }
    }

    if (!parentWayIDs.size) return;

    context.enter('select-osm', {
      selection: { osm: [...parentWayIDs] },
      focusedParentID: this._focusedParentID  // keep focus on same parentWay
    });
  }


  /**
   * _selectChildNodes
   */
  _selectChildNodes() {
    const context = this.context;
    const childNodeIDs = new Set();

    for (const entity of this._selectedData.values()) {
      if (entity.type !== 'way') continue;

      for (const nodeID of entity.nodes) {
        childNodeIDs.add(nodeID);
      }
    }

    if (!childNodeIDs.size) return;

    context.enter('select-osm', {
      selection: { osm: [...childNodeIDs] },
      focusedParentID: this._focusedParentID  // keep focus on same praentWay
    });
  }


  /**
   * _hover
   * Changes the cursor styling based on what geometry is hovered
   */
  _hover(eventData) {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const eventManager = context.systems.map.renderer.events;

    const target = eventData.target;
    const datum = target?.data;
    const entity = datum && graph.hasEntity(datum.id);
    const geom = entity?.geometry(graph) ?? 'unknown';

    switch (geom) {
      case 'area':
        eventManager.setCursor('areaCursor');
        break;
      case 'line':
        eventManager.setCursor('lineCursor');
        break;
      case 'point':
        eventManager.setCursor('pointCursor');
        break;
      case 'unknown':
        eventManager.setCursor('selectSplitCursor');
        break;
      case 'vertex':
        eventManager.setCursor('vertexCursor');
        break;
      default:
        eventManager.setCursor('grab');
        break;
    }
  }

}
