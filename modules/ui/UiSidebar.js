import { interpolateNumber as d3_interpolateNumber } from 'd3-interpolate';
import { select as d3_select } from 'd3-selection';
import { Extent } from '@rapid-sdk/math';
import { utilArrayIdentical } from '@rapid-sdk/util';
import _throttle from 'lodash-es/throttle.js';

import { osmEntity, osmNote, QAItem } from '../osm/index.js';
import { uiDataEditor } from './data_editor.js';
import { uiFeatureList } from './feature_list.js';
import { UiInspector } from './UiInspector.js';
import { uiKeepRightEditor } from './keepRight_editor.js';
import { uiMapRouletteEditor } from './maproulette_editor.js';
import { uiOsmoseEditor } from './osmose_editor.js';
import { uiNoteEditor } from './note_editor.js';
import { uiRapidFeatureInspector } from './rapid_feature_inspector.js';
import { utilFastMouse } from '../util/index.js';


const minWidth = 240;  // needs to match the min-width in our css file


/**
 * UiSidebar
 * The Sidebar is positioned to the side of the map and can show various information.
 * It can appear either on the left or right side of the map (depending on `l10n.isRTL`)
 * While editing and interacting with the map, some sidebar components may be classed as hidden,
 * and custom components can be allowed to cover up the feature picker or OSM Inspector.
 *
 * @example
 *  <div class='sidebar'>
 *    <div class='sidebar-resizer'/>     // The resizer handle
 *    <div class='feature-list-pane'/>   // Feature list / search component
 *    <div class='inspector-wrap'/>      // Inspector - the components for working with OSM
 *    <div class='sidebar-component'/>   // Custom UI - everything else (Notes, Rapid, QA Icons, Save, etc)
 *  </div>
 */
export class UiSidebar {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    // Create child components
    this.Inspector = new UiInspector(context);
    this.RapidInspector = uiRapidFeatureInspector(context);
    this.DataEditor = uiDataEditor(context);
    this.NoteEditor = uiNoteEditor(context);
    this.KeepRightEditor = uiKeepRightEditor(context);
    this.OsmoseEditor = uiOsmoseEditor(context);
    this.MapRouletteEditor = uiMapRouletteEditor(context);

    // D3 selections
    this.$parent = null;
    this.$sidebar = null;
    this.$resizer = null;
    this.$custom = null;
    this.$featureList = null;
    this.$inspector = null;

    this._startPointerID = null;
    this._startClientX = null;
    this._startWidth = null;
    this._lastClientX = null;
    this._containerLocGetter = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.toggle = this.toggle.bind(this);
    this._hover = this._hover.bind(this);
    this._dblclick = this._dblclick.bind(this);
    this._pointerup = this._pointerup.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._pointerdown = this._pointerdown.bind(this);
    this._eventCancel = this._eventCancel.bind(this);

    /**
     * hover
     * Hovers over the given targets
     * This just wraps the internal `_hover` in a throttle to keep it from being called too frequently.
     * @param  {Array}  targets - Array of data to target, but only the first one is used currently
     */
    this.hover = _throttle(this._hover, 200);
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders)
   * @param {d3-selection} $parent - A d3-selection to a HTMLEement that this component should render itself into
   */
  render($parent = this.$parent) {
    if ($parent) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    const context = this.context;
    const l10n = context.systems.l10n;
    const dir = l10n.textDirection();

    // add .sidebar
    let $sidebar = $parent.selectAll('.sidebar')
      .data([dir]);

    $sidebar.exit()
      .remove();

    const $$sidebar = $sidebar.enter()
      .append('div')
      .attr('class', 'sidebar');

    this.$sidebar = $sidebar = $sidebar.merge($$sidebar);


    // add .sidebar-resizer
    let $resizer = $parent.selectAll('.sidebar-resizer')
      .data([0]);

    const $$resizer = $resizer.enter()
      .append('div')
      .attr('class', 'sidebar-resizer')
      .each((d, i, nodes) => {
        nodes[i].addEventListener('dblclick', this._dblclick);
        nodes[i].addEventListener('pointerdown', this._pointerdown);
      });

    this.$resizer = $resizer = $resizer.merge($$resizer);


    // add sidebar contents: feature list pane and inspector
    $sidebar
      .append('div')
      .attr('class', 'feature-list-pane')
      .call(uiFeatureList(context));

    $sidebar
      .call(this.Inspector.render);

    this.$featureList = $sidebar.select('.feature-list-pane');
    this.$inspector = $sidebar.select('.inspector-wrap');

// figure out a better way to rebind this if locale changes
    const keys = [l10n.t('sidebar.key'), '`', '²', '@'];  // iD#5663, iD#6864 - common QWERTY, AZERTY
    context.keybinding().off(keys);
    context.keybinding().on(keys, this.toggle);
  }


  /**
   * _hover
   * Hovers over the given map data
   * @param  {Array}  targets - Array of data to target, but only the first one is used currently
   */
  _hover(targets) {
    const $sidebar = this.$sidebar;
    const $inspector = this.$inspector;
    const $featureList = this.$featureList;
    if (!$sidebar || !$inspector || !$featureList) return;  // called too early?

    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    let datum = targets && targets.length && targets[0];

    const Inspector = this.Inspector;

    if (datum?.__featurehash__) {   // hovering on data
      this.show(this.DataEditor.datum(datum));
      $sidebar.selectAll('.sidebar-component')
        .classed('inspector-hover', true);

    } else if (datum?.__fbid__) {   // hovering on Rapid data
      this.show(this.RapidInspector.datum(datum));
      $sidebar.selectAll('.sidebar-component')
        .classed('inspector-hover', true);

    } else if (datum instanceof osmNote) {
      if (context.mode?.id === 'drag-note') return;

      const service = context.services.osm;
      if (service) {
        datum = service.getNote(datum.id);   // marker may contain stale data - get latest
      }

      this.show(this.NoteEditor.note(datum));
      $sidebar.selectAll('.sidebar-component')
        .classed('inspector-hover', true);

    } else if (datum instanceof QAItem) {
      const service = context.services[datum.service];
      let Component;

      if (service) {
        datum = service.getError(datum.id);  // marker may contain stale data - get latest

        if (service.id === 'keepRight') {
          Component = this.KeepRightEditor;
        } else if (service.id === 'osmose') {
          Component = this.OsmoseEditor;
        } else if (service.id === 'maproulette') {
          Component = this.MapRouletteEditor;
        }
      }

      if (Component) {
        this.show(Component.error(datum));
      }

      $sidebar.selectAll('.sidebar-component')
        .classed('inspector-hover', true);

    } else if (!this.$custom && (datum instanceof osmEntity) && graph.hasEntity(datum)) {
      $featureList
        .classed('inspector-hidden', true);

      $inspector
        .classed('inspector-hidden', false)
        .classed('inspector-hover', true);

      if (!Inspector.entityIDs() || !utilArrayIdentical(Inspector.entityIDs(), [datum.id]) || Inspector.state() !== 'hover') {
        Inspector
          .state('hover')
          .entityIDs([datum.id])
          .newFeature(false);

        $sidebar
          .call(Inspector.render);
      }

    } else if (!this.$custom) {
      $featureList.classed('inspector-hidden', false);
      $inspector.classed('inspector-hidden', true);
      Inspector.state('hide');

    } else {
      this.hide();
    }
  }


  /**
   * intersects
   * Test if the sidebar is covering up the given extent
   * @param  {Extent}   wgs84Extent - an Extent in lon/lat coordinates
   * @return `true` if the sidebar is intersecting the Extent, `false` if not
   */
  intersects(wgs84Extent) {
    const $sidebar = this.$sidebar;
    if (!$sidebar) return false;  // called too early?

    const context = this.context;
    const rect = $sidebar.node().getBoundingClientRect();

    return wgs84Extent.intersects(new Extent(
      context.viewport.unproject([0, rect.height]),
      context.viewport.unproject([rect.width, 0])
    ));
  }


  /**
   * select
   * Selects the given ids - they are expected to be OSM IDs already loaded (in the Graph)
   * @param  {Array}    ids - ids to select (expected to be OSM IDs)
   * @param  {boolean}  newFeature - true if it's a new feature, passed to the inspector
   */
  select(ids, newFeature) {
    this.hide();

    const $sidebar = this.$sidebar;
    if (!$sidebar) return;  // called too early?

    const Inspector = this.Inspector;
    const $inspector = this.$inspector;
    const $featureList = this.$featureList;

    if (ids && ids.length) {
      const context = this.context;
      const editor = context.systems.editor;
      const graph = editor.staging.graph;
      const entity = ids.length === 1 && graph.entity(ids[0]);

      if (entity && newFeature && $sidebar.classed('collapsed')) {
        // uncollapse the sidebar
        const extent = entity.extent(graph);
        this.expand(this.intersects(extent));
      }

      $featureList
        .classed('inspector-hidden', true);

      $inspector
        .classed('inspector-hidden', false)
        .classed('inspector-hover', false);

      // Refresh the UI even if the ids are the same since the entities
      // themselves may have changed
      Inspector
        .state('select')
        .entityIDs(ids)
        .newFeature(newFeature);

      $sidebar
        .call(Inspector.render);

    } else {
      $inspector
        .classed('inspector-hidden', true)
        .classed('inspector-hover', false);

      Inspector
        .entityIDs([])
        .state('hide');
    }
  }


  /**
   * showPresetList
   * Shows inspector open to Preset List
   */
  showPresetList(...args) {
    this.Inspector.showPresetList(...args);
  }


  /**
   * showEntityEditor
   * Shows inspector open to Entity Editor
   */
  showEntityEditor(...args) {
    this.Inspector.showEntityEditor(...args);
  }


  /**
   * show
   * Shows some "custom" content in the sidebar
   * This is how almost all content renders to the sidebar
   * (except for the OSM editing "inspector", which is special)
   */
  show(renderFn) {
    this.$featureList.classed('inspector-hidden', true);
    this.$inspector.classed('inspector-hidden', true);

    const $sidebar = this.$sidebar;
    if (!$sidebar) return;  // called too early?

    if (this.$custom) {
      this.$custom.remove();
    }

    this.$custom = $sidebar
      .append('div')
      .attr('class', 'sidebar-component')
      .call(renderFn);
  }


  /**
   * hide
   * Removes all "custom" content in the sidebar
   */
  hide() {
    this.$featureList.classed('inspector-hidden', false);
    this.$inspector.classed('inspector-hidden', true);

    if (this.$custom) {
      this.$custom.remove();
      this.$custom = null;
    }
  }


  /**
   * expand
   * Expands the sidebar
   */
  expand(moveMap) {
    const $sidebar = this.$sidebar;
    if (!$sidebar) return;  // called too early?

    if ($sidebar.classed('collapsed')) {
      this.toggle(moveMap);
    }
  }


  /**
   * collapse
   * Collapses the sidebar
   */
  collapse(moveMap) {
    const $sidebar = this.$sidebar;
    if (!$sidebar) return;  // called too early?

    if (!$sidebar.classed('collapsed')) {
      this.toggle(moveMap);
    }
  }


  /**
   * toggle
   * Toggles the sidebar between expanded/collapsed states
   */
  toggle(moveMap) {
    const context = this.context;
    const $container = context.container();
    const l10n = context.systems.l10n;

    // Don't allow sidebar to toggle when the user is in the walkthrough.
    if (context.inIntro) return;

    const $sidebar = this.$sidebar;
    if (!$sidebar) return;  // called too early?

    const isCollapsed = $sidebar.classed('collapsed');
    const isCollapsing = !isCollapsed;
//    const isRTL = l10n.isRTL();
//    const scaleX = isRTL ? 0 : 1;
//    const xMarginProperty = isRTL ? 'margin-right' : 'margin-left';
//
//    sidebarWidth = sidebar.node().getBoundingClientRect().width;
//
//    // switch from % to px
//    sidebar.style('width', `${sidebarWidth}px`);
//
//    let startMargin, endMargin, lastMargin;
//    if (isCollapsing) {
//      startMargin = lastMargin = 0;
//      endMargin = -sidebarWidth;
//    } else {
//      startMargin = lastMargin = -sidebarWidth;
//      endMargin = 0;
//    }
//
//    if (!isCollapsing) {
//      // unhide the sidebar's content before it transitions onscreen
//      sidebar.classed('collapsed', isCollapsing);
//    }
//
//    sidebar
//      .transition()
//      .style(xMarginProperty, endMargin + 'px')
//      .tween('panner', () => {
//        let i = d3_interpolateNumber(startMargin, endMargin);
//        return function(t) {
//          let dx = lastMargin - Math.round(i(t));
//          lastMargin = lastMargin - dx;
//          ui.resize(moveMap ? undefined : [dx * scaleX, 0]);
//        };
//      })
//      .on('end', () => {
//        if (isCollapsing) {
//          // hide the sidebar's content after it transitions offscreen
//          sidebar.classed('collapsed', isCollapsing);
//        }
//        // switch back from px to %
//        if (!isCollapsing) {
//          const containerWidth = container.node().getBoundingClientRect().width;
//          const widthPct = (sidebarWidth / containerWidth) * 100;
//          sidebar
//            .style(xMarginProperty, null)
//            .style('width', widthPct + '%');
//        }
//      });
  }


  /**
   * _dblclick
   * Handler for dblclick events on the resizer.
   * Toggle sidebar when double-clicking the resizer
   * @param {MouseEvent}  e - the dblclick event
   */
  _dblclick(e) {
    e.preventDefault();
    if (e.sourceEvent) {
      e.sourceEvent.preventDefault();
    }
    this.toggle();
  }


  /**
   * _pointerdown
   * Handler for pointerdown events on the resizer.
   * @param {PointerEvent}  e - the pointerdown event
   */
  _pointerdown(e) {
    if (this._startPointerID) return;  // already resizing

    if ('button' in e && e.button !== 0) return;

    const $sidebar = this.$sidebar;
    const $resizer = this.$resizer;

    const startWidth = $sidebar.node().getBoundingClientRect().width;

    this._startPointerID = e.pointerId || 'mouse';
    this._startClientX = e.clientX;
    this._startWidth = startWidth;
    this._lastClientX = e.clientX;

    $sidebar.style('flex-basis', `${startWidth}px`);
    $resizer.classed('dragging', true);

    window.addEventListener('pointermove', this._pointermove);
    window.addEventListener('pointerup', this._pointerup);
    window.addEventListener('pointercancel', this._pointerup);
    // cancel touchmove to disable page scrolling while resizing
    window.addEventListener('touchmove', this._eventCancel, { passive: false });
  }


  /**
   * _pointermove
   * Handler for pointermove events
   * @param {PointerEvent}  e - the pointermove event
   */
  _pointermove(e) {
    if (this._startPointerID !== (e.pointerId || 'mouse')) return;   // not down, or different pointer

    e.preventDefault();

    const context = this.context;
    const ui = context.systems.ui;
//    const container = context.container();
    const $sidebar = this.$sidebar;

    const dx = e.clientX - this._startClientX;
    const setWidth = this._startWidth + dx;
    $sidebar.style('flex-basis', `${setWidth}px`);

    const panx = e.clientX - this._lastClientX;
    this._lastClientX = e.clientX;
    ui.resize([-panx, 0]);   // keep the map centered on the same spot


// todo
//    const isCollapsed = sidebar.classed('collapsed');
//    const shouldCollapse = setWidth < minWidth;
//
//    if (shouldCollapse && !isCollapsed) {
//      sidebar.classed('collapsed', true);
//    } else if (!shouldCollapse && isCollapsed) {
//      sidebar.classed('collapsed', false);
//    }

//todont
//    sidebar.classed('collapsed', shouldCollapse);
//
//    if (shouldCollapse) {
//      if (!isCollapsed) {
//        sidebar.style('flex-basis', '0px');
//        // ui.resize([(sidebarWidth - dx) * scaleX, 0]);
//      }
//
//    } else {
//      const widthPct = (sidebarWidth / containerWidth) * 100;
//      sidebar
//        .style(xMarginProperty, null)
//        .style('width', widthPct + '%');
//
//      if (isCollapsed) {
//        // ui.resize([-sidebarWidth * scaleX, 0]);
//      } else {
//        // ui.resize([-dx * scaleX, 0]);
//      }
//    }
  }


  /**
   * _pointerup
   * Handler for pointerup events
   * @param {PointerEvent}  e - the pointerup event
   */
  _pointerup(e) {
    if (this._startPointerID !== (e.pointerId || 'mouse')) return;   // not down, or different pointer

    this._startPointerID = null;
    this.$resizer.classed('dragging', false);

    window.removeEventListener('pointermove', this._pointermove);
    window.removeEventListener('pointerup', this._pointerup);
    window.removeEventListener('pointercancel', this._pointerup);
    window.removeEventListener('touchmove', this._eventCancel, { passive: false });

//    d3_select(window)
//      .on('touchmove.sidebar-resizer', null)
//      .on('pointermove.sidebar-resizer', null)
//      .on('pointerup.sidebar-resizer pointercancel.sidebar-resizer', null);
  }


  /**
   * _eventCancel
   * Just cancels an event
   * @param {Event}  e - the event to cancel
   */
  _eventCancel(e) {
    e.preventDefault();
  }
}
