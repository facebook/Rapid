import { interpolateNumber as d3_interpolateNumber } from 'd3-interpolate';
import { Extent, vecLength } from '@rapid-sdk/math';
import { utilArrayIdentical } from '@rapid-sdk/util';
import _throttle from 'lodash-es/throttle.js';

import { osmEntity, QAItem } from '../osm/index.js';
import { uiDataEditor } from './data_editor.js';
import { uiFeatureList } from './feature_list.js';
import { UiInspector } from './UiInspector.js';
import { uiKeepRightEditor } from './keepRight_editor.js';
import { uiMapRouletteEditor } from './maproulette_editor.js';
import { uiOsmoseEditor } from './osmose_editor.js';
import { uiNoteEditor } from './note_editor.js';
import { uiRapidFeatureInspector } from './rapid_feature_inspector.js';
import { uiTooltip } from './tooltip.js';


const NEAR_TOLERANCE = 4;
const MIN_WIDTH = 240;
const DEFAULT_WIDTH = 400;  // needs to match the flex-basis in our css file


/**
 * UiSidebar
 * The Sidebar is positioned to the side of the map and can show various information.
 * It can appear either on the left or right side of the map (depending on `l10n.isRTL`)
 * While editing and interacting with the map, some sidebar components may be classed as hidden,
 * and custom components can be allowed to cover up the feature picker or OSM Inspector.
 *
 * @example
 *  <div class='sidebar'>
 *    <div class='resizer'/>             // The resizer
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
    this.Tooltip = uiTooltip(context);

    // D3 selections
    this.$parent = null;
    this.$sidebar = null;
    this.$resizer = null;
    this.$custom = null;
    this.$featureList = null;
    this.$inspector = null;

    this._startPointerID = null;
    this._startCoord = null;
    this._startWidth = null;
    this._lastCoord = null;
    this._lastWidth = null;
    this._expandWidth = DEFAULT_WIDTH;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.toggle = this.toggle.bind(this);
    this._hover = this._hover.bind(this);
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
    const storage = context.systems.storage;

    const dir = l10n.textDirection();
    const preferCollapsed = (storage.getItem('inspector.collapsed') === 'true');
    const storedWidth = +(storage.getItem('inspector.width') || DEFAULT_WIDTH);
    this._expandWidth = Math.max(MIN_WIDTH, storedWidth);

    // add .sidebar
    let $sidebar = $parent.selectAll('.sidebar')
      .data([dir]);

    $sidebar.exit()
      .remove();

    const $$sidebar = $sidebar.enter()
      .append('div')
      .attr('class', 'sidebar')
      .classed('collapsed', preferCollapsed)
      .style('flex-basis', `${this._expandWidth}px`);

    this.$sidebar = $sidebar = $sidebar.merge($$sidebar);


    // add .resizer
    let $resizer = $parent.selectAll('.resizer')
      .data([0]);

    const $$resizer = $resizer.enter()
      .append('div')
      .attr('class', 'resizer')
      .each((d, i, nodes) => {
        nodes[i].addEventListener('pointerdown', this._pointerdown);
      });

    $$resizer
      .append('div')
      .attr('class', 'resizer-handle');

    this.$resizer = $resizer = $resizer.merge($$resizer)
      .call(this.Tooltip
        .placement(dir === 'rtl' ? 'right' : 'left')  // place on the sidebar side (i.e. don't cover the map)
        .title(l10n.t('inspector.tooltip'))
        .shortcut(l10n.t('inspector.key'))
      );


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
    const keys = [l10n.t('inspector.key'), '`', '²', '@'];  // iD#5663, iD#6864 - common QWERTY, AZERTY
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

    } else if (datum instanceof QAItem && datum.service === 'osm') {
      if (context.mode?.id === 'drag-note') return;

      const service = context.services.osm;
      if (service) {
        datum = service.getNote(datum.id);   // marker may contain stale data - get latest
      }

      this.show(this.NoteEditor.note(datum));
      $sidebar.selectAll('.sidebar-component')
        .classed('inspector-hover', true);

    } else if (datum instanceof QAItem && datum.service !== 'osm') {
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
  select(ids, newFeature = false) {
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
    const $sidebar = this.$sidebar;
    if (!$sidebar) return;  // called too early?

    // Don't allow sidebar to toggle when the user is in the walkthrough.
    const context = this.context;
    if (context.inIntro) return;

    const ui = context.systems.ui;
    const $container = context.container();

    // We get the "preferred" expended width from `flex-basis`.
    // When the sidebar is shown, this is the width that flexbox will use.
    // When the sidebar is hidden (display: none), it is ignored.
    const expandWidth = this._expandWidth || DEFAULT_WIDTH;
    const startCollapsed = $sidebar.classed('collapsed');
    const startWidth = startCollapsed ? 0 : expandWidth;
    const endCollapsed = !startCollapsed;
    const endWidth = endCollapsed ? 0 : expandWidth;
    const lerp = d3_interpolateNumber(startWidth, endWidth);

    this._startWidth = startWidth;
    this._lastWidth = startWidth;

    $sidebar
      .transition()
      .tween('inspector.toggler', () => {
        return t => {
          const setWidth = lerp(t);

          $sidebar
            .classed('collapsing', setWidth < MIN_WIDTH)
            .style('flex-basis', `${setWidth}px`);

          ui.resize();
          this._lastWidth = setWidth;
        };
      })
      .on('start', () => {
        $container.classed('resizing', true);

        $sidebar
          .classed('collapsing', startWidth < MIN_WIDTH)
          .classed('collapsed', false)
          .style('flex-basis', `${startWidth}px`);
      })
      .on('end interrupt', () => {
        $container.classed('resizing', false);

        $sidebar
          .classed('collapsing', false)
          .classed('collapsed', endCollapsed)
          .style('flex-basis', `${expandWidth}px`);  // done resize, put expanded width back here

        ui.resize();
        this._storePreferences();
      });
  }


  /**
   * _pointerdown
   * Handler for pointerdown events on the resizer.
   * @param {PointerEvent}  e - the pointerdown event
   */
  _pointerdown(e) {
    if (this._startPointerID) return;  // already resizing

    if ('button' in e && e.button !== 0) return;

    const $container = this.context.container();
    const $sidebar = this.$sidebar;

    const expandWidth = this._expandWidth || DEFAULT_WIDTH;
    const startCollapsed = $sidebar.classed('collapsed');
    const startWidth = startCollapsed ? 0 : expandWidth;

    this._startPointerID = e.pointerId || 'mouse';
    this._startCoord = [e.clientX, e.clientY];
    this._startWidth = startWidth;
    this._lastCoord = [e.clientX, e.clientY];
    this._lastWidth = startWidth;

    this.Tooltip.hide();
    $container.classed('resizing', true);

    $sidebar
      .classed('collapsed', false)
      .classed('collapsing', startWidth < MIN_WIDTH)
      .style('flex-basis', `${startWidth}px`);

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
    const l10n = context.systems.l10n;
    const ui = context.systems.ui;
    const scaleX = l10n.isRTL() ? -1 : 1;

    const dx = (e.clientX - this._lastCoord[0]) * scaleX;
    const setWidth = this._lastWidth + dx;

    if (dx) {
      this.$sidebar
        .classed('collapsing', setWidth < MIN_WIDTH)
        .style('flex-basis', `${setWidth}px`);

      ui.resize();
    }

    this._lastCoord = [e.clientX, e.clientY];
    this._lastWidth = setWidth;
  }


  /**
   * _pointerup
   * Handler for pointerup events
   * @param {PointerEvent}  e - the pointerup event
   */
  _pointerup(e) {
    if (this._startPointerID !== (e.pointerId || 'mouse')) return;   // not down, or different pointer

    this._startPointerID = null;
    window.removeEventListener('pointermove', this._pointermove);
    window.removeEventListener('pointerup', this._pointerup);
    window.removeEventListener('pointercancel', this._pointerup);
    window.removeEventListener('touchmove', this._eventCancel, { passive: false });

    const context = this.context;
    const ui = context.systems.ui;

    const $sidebar = this.$sidebar;
    const $container = context.container();

    const endWidth = this._lastWidth;
    const endCollapsed = endWidth < MIN_WIDTH;

    // We'll lock in the "preferred" expended width in `flex-basis`.
    // If the user collapsed the sidebar by dragging, assume that they
    // would want to expand it back to its original size.
    const expandWidth = endCollapsed ? this._expandWidth : endWidth;
    this._expandWidth = expandWidth;

    $container.classed('resizing', false);

    $sidebar
      .classed('collapsing', false)
      .classed('collapsed', endCollapsed)
      .style('flex-basis', `${expandWidth}px`);  // done resize, put expanded width back here

    const startCoord = this._startCoord;
    const endCoord = [e.clientX ?? startCoord[0], e.clientY ?? endCoord[0]];
    const dist = vecLength(startCoord, endCoord);
    if (dist < NEAR_TOLERANCE) {  // this was a click, not a drag
      this.toggle();              // run the toggle transition
    } else {
      ui.resize();
      this._storePreferences();
    }
  }


  /**
   * _eventCancel
   * Just cancels an event
   * @param {Event}  e - the event to cancel
   */
  _eventCancel(e) {
    e.preventDefault();
  }


  /**
   * _storePreferences
   * Store the sidebar preferences
   */
  _storePreferences() {
    const $sidebar = this.$sidebar;
    if (!$sidebar) return;  // called too early?

    const preferCollapsed = $sidebar.classed('collapsed') ? 'true' : 'false';
    const preferWidth = this._expandWidth;

    const storage = this.context.systems.storage;
    storage.setItem('inspector.collapsed', preferCollapsed);
    storage.setItem('inspector.width', preferWidth);
  }
}
