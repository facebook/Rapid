import { select as d3_select } from 'd3-selection';

import { AbstractMode } from './AbstractMode';
import { actionDeleteRelation } from '../actions/delete_relation';
import * as Operations from '../operations/index';
import { uiCmd } from '../ui/cmd';
import { utilKeybinding, utilTotalExtent } from '../util';


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

    // If we have a single thing selected, keep track of it here
    this._singularDatum = null;

    // Make sure the event handlers have `this` bound correctly
    this._esc = this._esc.bind(this);
    this._firstVertex = this._firstVertex.bind(this);
    this._focusNextParent = this._focusNextParent.bind(this);
    this._lastVertex = this._lastVertex.bind(this);
    this._nextVertex = this._nextVertex.bind(this);
    this._previousVertex = this._previousVertex.bind(this);
    this._undoOrRedo = this._undoOrRedo.bind(this);
  }


  /**
   * enter
   * Expects a `selectedIDs` Array property in the options
   * @param  `options`  Optional `Object` of options passed to the new mode
   */
  enter(options = {}) {
    const entityIDs = options.selectedIDs;
    this._newFeature = options.newFeature;

    if (!Array.isArray(entityIDs)) return false;
    if (!entityIDs.length) return false;

    const context = this.context;
    const locations = context.systems.locations;

    // For this mode, keep only the OSM data
    let selectedIDs = [];
    this._selectedData = new Map();
    this._singularDatum = null;

    for (const entityID of entityIDs) {
      const entity = context.hasEntity(entityID);
      if (!entity) continue;   // not osm
      if (entity.type === 'node' && locations.blocksAt(entity.loc).length) continue;  // editing is blocked

      this._selectedData.set(entityID, entity);   // otherwise keep it
      selectedIDs.push(entityID);
      if (entityIDs.length === 1) {
        this._singularDatum = entity;   // a single thing is selected
      }
    }

    if (!this._selectedData.size) return false;  // nothing to select

    this._active = true;
    context.enableBehaviors(['hover', 'select', 'drag', 'map-interaction', 'lasso', 'paste']);

    // Compute the total extent of selected items
    this.extent = utilTotalExtent(selectedIDs, context.graph());

    // Put selectedIDs into the url hash
    context.systems.urlhash.setParam('id', selectedIDs.join(','));

    // Exclude these ids from filtering
    context.systems.filters.forceVisible(selectedIDs);

    // setup which operations are valid for this selection
    this.operations.forEach(o => {
      if (o.behavior) {
        o.behavior.disable();
      }
    });

    this.operations = Object.values(Operations)
      .map(o => o(context, selectedIDs))
      .filter(o => (o.id !== 'delete' && o.id !== 'downgrade' && o.id !== 'copy'))
      .concat([
          // group copy/downgrade/delete operation together at the end of the list
          Operations.operationCopy(context, selectedIDs),
          Operations.operationDowngrade(context, selectedIDs),
          Operations.operationDelete(context, selectedIDs)
        ])
      .filter(o => o.available());

    this.operations.forEach(o => {
      if (o.behavior) {
        o.behavior.enable();
      }
    });

    context.systems.ui.closeEditMenu();   // remove any displayed menu

    this.keybinding = utilKeybinding('select');
    this.keybinding
      .on(['[', 'pgup'], this._previousVertex)
      .on([']', 'pgdown'], this._nextVertex)
      .on(['{', uiCmd('⌘['), 'home'], this._firstVertex)
      .on(['}', uiCmd('⌘]'), 'end'], this._lastVertex)
      .on(['\\', 'pause'], this._focusNextParent)
      .on('⎋', this._esc, true);
//      .on(uiCmd('⌘↑'), this._selectParent)    // tbh I dont know what these are
//      .on(uiCmd('⌘↓'), this._selectChild)

    d3_select(document)
      .call(this.keybinding);

    context.systems.ui.sidebar
      .select(selectedIDs, this._newFeature);

    context.systems.editor
      // this was probably to style the elements
      // .on('change', this._selectElements)    // reselect, in case relation members were removed or added
      .on('undone', this._undoOrRedo)
      .on('redone', this._undoOrRedo);

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

    // If the user added an empty relation, we should clean it up.
    const entity = context.hasEntity(this._singularDatum?.id);
    if (
      entity && entity.type === 'relation' &&
      // no tags
      Object.keys(entity.tags).length === 0 &&
      // no parent relations
      context.graph().parentRelations(entity).length === 0 &&
      // no members or one member with no role
      (entity.members.length === 0 || (entity.members.length === 1 && !entity.members[0].role))
    ) {
      // The user added this relation but didn't edit it at all, so just delete it
      const deleteAction = actionDeleteRelation(entity.id, true /* don't delete untagged members */);

      editor.perform(deleteAction, context.t('operations.delete.annotation.relation'));
      context.systems.validator.validate();
    }


    this.extent = null;
    this._newFeature = false;
    this._singularDatum = null;
    this._selectedData.clear();

    // disable operations
    this.operations.forEach(o => {
      if (o.behavior) {
        o.behavior.disable();
      }
    });
    this.operations = [];

    context.systems.ui.closeEditMenu();
    context.systems.ui.sidebar.hide();
    context.systems.urlhash.setParam('id', null);
    context.systems.filters.forceVisible([]);

    if (this.keybinding) {
      d3_select(document).call(this.keybinding.unbind);
      this.keybinding = null;
    }

    editor
      // .off('change', this._selectElements)
      .off('undone', this._undoOrRedo)
      .off('redone', this._undoOrRedo);
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
   * _undoOrRedo
   *  on undo or redo, see whether we can stay in this mode
   */
  _undoOrRedo() {
    const context = this.context;
    const locations = context.systems.locations;
    let selectedIDs = [];

    for (const [datumID, datum] of this._selectedData) {
      if (!context.hasEntity(datumID)) continue;   // was deleted
      if (datum.type === 'node' && locations.blocksAt(datum.loc).length) continue;  // editing is blocked
      selectedIDs.push(datumID);  // keep it selected
    }

    if (!selectedIDs.length) {
      context.enter('browse');
    } else {
      context.enter('select-osm', { selectedIDs: selectedIDs });   // reselect whatever remains
    }
  }


  /**
   * _chooseParentWay
   *  when using keyboard navigation, try to stay with the previously focused parent way
   */
  _chooseParentWay(entity) {
    if (!entity) return null;

    const graph = this.context.graph();

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

    const context = this.context;
    const way = this._chooseParentWay(this._singularDatum);
    if (!way) return;

    const node = context.entity(way.first());
    context.enter('select-osm', { selectedIDs: [node.id] });
    context.systems.map.centerEase(node.loc);
  }


  /**
   * _lastVertex
   *  jump to the first vertex along a way
   */
  _lastVertex(d3_event) {
    d3_event.preventDefault();

    const context = this.context;
    const way = this._chooseParentWay(this._singularDatum);
    if (!way) return;

    const node = context.entity(way.last());
    context.enter('select-osm', { selectedIDs: [node.id] });
    context.systems.map.centerEase(node.loc);
  }


  /**
   * _previousVertex
   *  jump to the previous vertex
   */
  _previousVertex(d3_event) {
    d3_event.preventDefault();

    const context = this.context;
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
      const node = context.entity(way.nodes[nextIndex]);
      context.enter('select-osm', { selectedIDs: [node.id] });
      context.systems.map.centerEase(node.loc);
    }
  }


  /**
   * _nextVertex
   *  jump to the next vertex
   */
  _nextVertex(d3_event) {
    d3_event.preventDefault();

    const context = this.context;
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
      const node = context.entity(way.nodes[nextIndex]);
      context.enter('select-osm', { selectedIDs: [node.id] });
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

    const graph = this.context.graph();
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
//
//      var childIds = this._focusedVertexIDs ? this._focusedVertexIDs.filter(id => context.hasEntity(id)) : childNodeIdsOfSelection(true);
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
//      var graph = context.graph();
//      var childs = [];
//
//      for (var i = 0; i < selectedIDs.length; i++) {
//          var entity = context.hasEntity(selectedIDs[i]);
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
