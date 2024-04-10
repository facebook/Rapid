import { select as d3_select } from 'd3-selection';
import { utilArrayIdentical } from '@rapid-sdk/util';

import { AbstractMode } from './AbstractMode.js';
import { actionDeleteRelation } from '../actions/delete_relation.js';
import { actionMove } from '../actions/move.js';
import * as Operations from '../operations/index.js';
import { operationMove } from '../operations/move.js';
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
    this._lastSelectedIDs = [];   // Previous selection, used by arrow key nudge

    // Make sure the event handlers have `this` bound correctly
    this._hover = this._hover.bind(this);
    this._merge = this._merge.bind(this);

    this._esc = this._esc.bind(this);
    this._firstVertex = this._firstVertex.bind(this);
    this._focusNextParent = this._focusNextParent.bind(this);
    this._lastVertex = this._lastVertex.bind(this);
    this._nextVertex = this._nextVertex.bind(this);
    this._previousVertex = this._previousVertex.bind(this);
    this._hover = this._hover.bind(this);
    this.nudgeSelection = this.nudgeSelection.bind(this);
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
    const locations = context.systems.locations;
    const ui = context.systems.ui;
    const urlhash = context.systems.urlhash;

    const selection = options.selection ?? {};
    let entityIDs = selection.osm ?? [];
    this._newFeature = options.newFeature;

    // Gather valid entities and entityIDs from selection.
    // For this mode, keep only the OSM data.
    this._selectedData = new Map();
    this._singularDatum = null;
    this._lastSelectedIDs = [];

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

    editor.on('merge', this._merge);

    context.behaviors.hover.on('hoverchange', this._hover);

    this.keybinding = utilKeybinding('select');
    this.keybinding
      .on(['[', 'pgup'], this._previousVertex)
      .on([']', 'pgdown'], this._nextVertex)
      .on(['{', uiCmd('⌘['), 'home'], this._firstVertex)
      .on(['}', uiCmd('⌘]'), 'end'], this._lastVertex)
      .on(['\\', 'pause'], this._focusNextParent)
      .on('⎋', this._esc, true)
      .on(uiCmd('←'), this.nudgeSelection([-5, 0]))
      .on(uiCmd('↑'), this.nudgeSelection([0, -5]))
      .on(uiCmd('→'), this.nudgeSelection([5, 0]))
      .on(uiCmd('↓'), this.nudgeSelection([0, 5]));
//      .on(uiCmd('⌘↑'), this._selectParent)    // tbh I dont know what these are
//      .on(uiCmd('⌘↓'), this._selectChild)

    d3_select(document)
      .call(this.keybinding);

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
    const l10n = context.systems.l10n;
    const ui = context.systems.ui;
    const urlhash = context.systems.urlhash;

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

    context.behaviors.hover.off('hoverchange', this._hover);
    editor.off('merge', this._merge);
  }


  /**
   * _esc
   *  return to browse mode
   */
  _esc() {
    const context = this.context;
    if (context.container().select('.combobox').size()) return;
    context.enter('browse');
  }


  /**
   * _merge
   * If we have entities selected already, and we find new versions
   * of them loaded from the server, the `operations` offered on
   * the edit menu may be wrong and should be refreshed. Rapid#1311
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
   *  Called whever we have a need to reset the `operations` array.
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
   *  when using keyboard navigation, try to stay with the previously focused parent way
   */
  _chooseParentWay(entity) {
    if (!entity) return null;

    const context = this.context;
    const graph = context.systems.editor.staging.graph;

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
   * nudgeSelection
   *  use shift + arrow keys to move selected features (+ option to move even more)
   */
  nudgeSelection(delta) {
    return () => {
      const context = this.context;
      const editor = context.systems.editor;
      const viewport = context.viewport;
      const ui = context.systems.ui;

      // prevent nudging during low zoom selection
      if (!context.editable()) return;

      const selectedIDs = [...this._selectedData.keys()];
      const moveOp = operationMove(context, selectedIDs);
      if (!moveOp.available()) return;

      if (moveOp.disabled()) {
        ui.flash
          .duration(4000)
          .iconName(`#rapid-operation-${moveOp.id}`)
          .iconClass('operation disabled')
          .label(moveOp.tooltip)();

      } else {
        // If the user has the same selection as before, we continue through the cycle..
        const isSameSelection = utilArrayIdentical(selectedIDs, this._lastSelectedIDs);
        if (!isSameSelection) {
          this._lastSelectedIDs = selectedIDs.slice();  // take copy
        }

        const annotation = moveOp.annotation();
        const options = { annotation: annotation, selectedIDs: selectedIDs };

        editor.perform(actionMove(selectedIDs, delta, viewport));
        if (isSameSelection && editor.getUndoAnnotation() === annotation) {
          editor.commitAppend(options);
        } else {
          editor.commit(options);
        }
      }
    };
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
    const graph = context.systems.editor.staging.graph;
    const node = graph.entity(way.first());

    context.enter('select-osm', { selection: { osm: [node.id] }} );
    context.systems.map.centerEase(node.loc);
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
    const graph = context.systems.editor.staging.graph;
    const node = graph.entity(way.last());

    context.enter('select-osm', { selection: { osm: [node.id] }} );
    context.systems.map.centerEase(node.loc);
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
      nextIndex = length - 2;
    }

    if (nextIndex !== -1) {
      const context = this.context;
      const graph = context.systems.editor.staging.graph;
      const node = graph.entity(way.nodes[nextIndex]);
      context.enter('select-osm', { selection: { osm: [node.id] }} );
      context.systems.map.centerEase(node.loc);
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
      const graph = context.systems.editor.staging.graph;
      const node = graph.entity(way.nodes[nextIndex]);
      context.enter('select-osm', { selection: { osm: [node.id] }} );
      context.systems.map.centerEase(node.loc);
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

    const graph = this.context.editor.staging.graph;
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


//  function selectParent(d3_event) {
//      d3_event.preventDefault();
//
//      var currentSelectedIds = mode.selectedIDs();
//      var parentIDs = this._focusedParentID ? [this._focusedParentID] : parentWaysIdsOfSelection(false);
//      if (!parentIDs.length) return;
//
//      context.enter(
//          mode.selectedIDs(parentIDs)
//      );
//      // set this after re-entering the selection since we normally want it cleared on exit
//      this._focusedVertexIDs = currentSelectedIds;
//  }
//
//  function selectChild(d3_event) {
//      d3_event.preventDefault();
//
//      var currentSelectedIds = mode.selectedIDs();
//      const context = this.context;
//      const graph = context.systems.editor.staging.graph;
//      var childIds = this._focusedVertexIDs ? this._focusedVertexIDs.filter(id => graph.hasEntity(id)) : childNodeIdsOfSelection(true);
//      if (!childIds || !childIds.length) return;
//
//      if (currentSelectedIds.length === 1) this._focusedParentID = currentSelectedIds[0];
//
//      context.enter(
//          mode.selectedIDs(childIds)
//      );
//  }
//
//  // find the child nodes for selected ways
//  function childNodeIdsOfSelection(onlyCommon) {
//      const context = this.context;
//      const graph = context.systems.editor.staging.graph;
//      var childs = [];
//
//      for (var i = 0; i < selectedIDs.length; i++) {
//          var entity = graph.hasEntity(selectedIDs[i]);
//
//          if (!entity || !['area', 'line'].includes(entity.geometry(graph))){
//              return [];  // selection includes non-area/non-line
//          }
//          var currChilds = graph.childNodes(entity).map(function(node) { return node.id; });
//          if (!childs.length) {
//              childs = currChilds;
//              continue;
//          }
//
//          childs = (onlyCommon ? utilArrayIntersection : utilArrayUnion)(childs, currChilds);
//          if (!childs.length) {
//              return [];
//          }
//      }
//
//      return childs;
//  }
//

}
