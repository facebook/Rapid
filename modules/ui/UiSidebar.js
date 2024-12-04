import { selection } from 'd3-selection';
import { interpolateNumber } from 'd3-interpolate';
import { Extent, vecLength } from '@rapid-sdk/math';
import _throttle from 'lodash-es/throttle.js';

import { osmEntity, QAItem } from '../osm/index.js';
import { uiDataEditor } from './data_editor.js';
import { UiFeatureList } from './UiFeatureList.js';
import { UiInspector } from './UiInspector.js';
import { uiDetectionInspector } from './detection_inspector.js';
import { uiKeepRightEditor } from './keepRight_editor.js';
import { uiMapRouletteEditor } from './maproulette_editor.js';
import { uiOsmoseEditor } from './osmose_editor.js';
import { uiNoteEditor } from './note_editor.js';
import { UiRapidInspector } from './UiRapidInspector.js';
import { UiOvertureInspector } from './UiOvertureInspector.js';
import { uiTooltip } from './tooltip.js';


const NEAR_TOLERANCE = 4;
const MIN_WIDTH = 240;
const DEFAULT_WIDTH = 400;  // needs to match the flex-basis in our css file


/**
 * UiSidebar
 * The Sidebar is positioned to the side of the map and can show various information.
 * It can appear either on the left or right side of the map (depending on `l10n.isRTL`)
 * While editing and interacting with the map, the sidebar will control which child
 * component is visible.
 *
 * @example
 *  <div class='sidebar'>
 *    <div class='feature-list-wrap'/>   // Feature list / search component
 *    <div class='inspector-wrap'/>      // Inspector - the components for working with OSM
 *    <div class='sidebar-component'/>   // Custom UI - everything else (Notes, Rapid, QA Icons, Save, etc)
 *  </div>
 *  <div class='resizer'/>
 */
export class UiSidebar {

  /**
   * @constructor
   * @param  `conttext`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this._keys = null;

    // Create child components
    this.DataEditor = uiDataEditor(context);
    this.DetectionInspector = uiDetectionInspector(context);
    this.FeatureList = new UiFeatureList(context);
    this.Inspector = new UiInspector(context);
    this.KeepRightEditor = uiKeepRightEditor(context);
    this.MapRouletteEditor = uiMapRouletteEditor(context);
    this.NoteEditor = uiNoteEditor(context);
    this.OsmoseEditor = uiOsmoseEditor(context);
    this.RapidInspector = new UiRapidInspector(context);
    this.OvertureInspector = new UiOvertureInspector(context);
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
    this._hoverchange = this._hoverchange.bind(this);
    this._pointerup = this._pointerup.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._pointerdown = this._pointerdown.bind(this);
    this._eventCancel = this._eventCancel.bind(this);
    this._setupKeybinding = this._setupKeybinding.bind(this);

    /**
     * hover
     * Hovers over the given targets
     * This just wraps the internal `_hover` in a throttle to keep it from being called too frequently.
     * @param  {Object}  target - data element to target
     */
    this.hover = _throttle(this._hover, 200);

    // Setup event handlers
    context.behaviors.hover.on('hoverchange', this._hoverchange);

    const l10n = context.systems.l10n;
    l10n.on('localechange', this._setupKeybinding);
    this._setupKeybinding();
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders)
   * @param {d3-selection} $parent - A d3-selection to a HTMLElement that this component should render itself into
   */
  render($parent = this.$parent) {
    if ($parent instanceof selection) {
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
        .shortcut(l10n.t('shortcuts.command.toggle_inspector.key'))
      );

    $sidebar
      .call(this.FeatureList.render);

    $sidebar
      .call(this.Inspector.render);

    this.$featureList = $sidebar.select('.feature-list-wrap');
    this.$inspector = $sidebar.select('.inspector-wrap');
  }


  /**
   * _hoverchange
   * Respond to any change in hover
   * @param {Object}  eventData - data about what is being hovered
   */
  _hoverchange(eventData) {
    const context = this.context;
    const gfx = context.systems.gfx;
    const scene = gfx.scene;

    const target = eventData.target;
    const layer = target?.layer;
    const dataID = target?.dataID;
    const data = target?.data;

    const modeID = context.mode?.id;
    if (modeID !== 'select' && modeID !== 'select-osm') {
      this.hover(data);
    }

    scene.clearClass('hover');
    if (layer && dataID) {
      // Only set hover class if this target isn't currently drawing
      const drawingIDs = layer.getDataWithClass('drawing');
      if (!drawingIDs.has(dataID)) {
        layer.setClass('hover', dataID);
      }
    }

    gfx.immediateRedraw();
  }


  /**
   * _hover
   * Hovers the given target data
   * @param  {Object}  target - data element to target
   */
  _hover(target) {
    const $sidebar = this.$sidebar;
    const $inspector = this.$inspector;
    const $featureList = this.$featureList;
    if (!$sidebar || !$inspector || !$featureList) return;  // called too early?

    // Exception: don't replace the "save-success" screen on hover.
    // Wait for the user to dismiss it or select something else. Rapid#700
    if (this.$custom && this.$custom.selectAll('.save-success').size()) return;

    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    let datum = target;

    // Start by clearing out any custom state.
    this.reset();

    // Hovering on Geo Data (vector tile, geojson, etc..)
    if (datum?.__featurehash__) {
      this.show(this.DataEditor.datum(datum));
    // Hovering on Rapid data..
    } else if (datum?.__fbid__) {
      this.RapidInspector.datum = datum;
      this.show(this.RapidInspector.render);
    // Hovering on Overture data..
    } else if (datum?.overture) {
      this.OvertureInspector.datum = datum;
      this.show(this.OvertureInspector.render);
    // Hovering on Mapillary detection..
    } else if (datum?.type === 'detection') {
      this.show(this.DetectionInspector.datum(datum));

    // Hovering on OSM Note..
    } else if (datum instanceof QAItem && datum.service === 'osm') {
      if (context.mode?.id === 'drag-note') return;

      const service = context.services.osm;
      if (service) {
        datum = service.getNote(datum.id);   // marker may contain stale data - get latest
      }

      this.show(this.NoteEditor.note(datum));

    // Hovering on other QA Item..
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
    }

    // ^ That covers all the custom content we can hover over.
    // If any of the above matched, `this.show()` would have taken care
    // of the sidebar, we just need to add the hover class..
    if (this.$custom) {
      this.$custom.classed('inspector-hover', true);

    // Hovering on an OSM item
    } else if ((datum instanceof osmEntity) && graph.hasEntity(datum.id)) {
      $featureList.classed('inspector-hidden', true);

      $inspector
        .classed('inspector-hidden', false)
        .classed('inspector-hover', true);

      this.Inspector
        .state('hover')
        .entityIDs([datum.id])
        .newFeature(false);

      $sidebar
        .call(this.Inspector.render);

    } else {
      this.hide();
    }
  }


  /**
   * intersects
   * Test if the sidebar is covering up the given extent
   * @param  {Extent}   wgs84Extent - an Extent in lon/lat coordinates
   * @return {boolean}  `true` if the sidebar is intersecting the `Extent`, `false` if not
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
   * showInspector
   * Selects the given ids - they are expected to be OSM IDs already loaded (in the Graph)
   * @param  {Array}    ids - ids to select (expected to be OSM IDs)
   * @param  {boolean}  newFeature - true if it's a new feature, passed to the inspector
   */
  showInspector(ids, newFeature = false) {
    const $sidebar = this.$sidebar;
    const $inspector = this.$inspector;
    const $featureList = this.$featureList;
    if (!$sidebar || !$inspector || !$featureList) return;  // called too early?

    if (Array.isArray(ids) && ids.length) {
      $featureList.classed('inspector-hidden', true);

      this.reset();

      $inspector
        .classed('inspector-hidden', false)
        .classed('inspector-hover', false);

      // Don't expand automatically, let the user control this - Rapid#1562
      // this.expand(true);

      // Always redraw the Inspector even if the ids are the same,
      // as the entities themselves may have changed.
      this.Inspector
        .state('select')
        .entityIDs(ids)
        .newFeature(newFeature);

      $sidebar
        .call(this.Inspector.render);

    } else {
      this.hide();
    }
  }


  /**
   * show
   * Shows some "custom" content in the sidebar
   * This is how almost all content renders to the sidebar
   * (except for the OSM editing "inspector", which is special)
   * @param  {function}  renderFn - A function suitable for use in `d3-selection.call`
   */
  show(renderFn) {
    const $sidebar = this.$sidebar;
    const $inspector = this.$inspector;
    const $featureList = this.$featureList;
    if (!$sidebar || !$inspector || !$featureList) return;  // called too early?

    if (renderFn) {
      if (this.$custom) {
        this.$custom.remove();
        this.$custom = null;
      }

      $featureList.classed('inspector-hidden', true);
      $inspector.classed('inspector-hidden', true);
      this.Inspector.entityIDs([]).state('hide');

      this.$custom = $sidebar
        .append('div')
        .attr('class', 'sidebar-component')
        .call(renderFn);

    } else {
      this.hide();
    }
  }


  /**
   * hide
   * Removes all content from the sidebar..
   * This resets the sidebar back to where it shows the featureList / search component.
   */
  hide() {
    const $inspector = this.$inspector;
    const $featureList = this.$featureList;
    if (!$inspector || !$featureList) return;  // called too early?

    this.reset();
    $featureList.classed('inspector-hidden', false);
    $inspector.classed('inspector-hidden', true);
    this.Inspector.entityIDs([]).state('hide');
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
   * expand
   * Expands the sidebar
   * @param  {boolean}  animate? - whether to animate the pane
   */
  expand(animate) {
    const $sidebar = this.$sidebar;
    if (!$sidebar) return;  // called too early?

    if ($sidebar.classed('collapsed')) {
      this.toggle(animate);
    }
  }


  /**
   * collapse
   * Collapses the sidebar
   * @param  {boolean}  animate? - whether to animate the pane
   */
  collapse(animate) {
    const $sidebar = this.$sidebar;
    if (!$sidebar) return;  // called too early?

    if (!$sidebar.classed('collapsed')) {
      this.toggle(animate);
    }
  }


  /**
   * toggle
   * Toggles the sidebar between expanded/collapsed states
   * @param  {boolean}  animate? - whether to animate the pane
   */
  toggle(animate = true) {
    const $sidebar = this.$sidebar;
    if (!$sidebar) return;  // called too early?

    const context = this.context;
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
    const lerp = interpolateNumber(startWidth, endWidth);

    this._startWidth = startWidth;
    this._lastWidth = startWidth;

    if (animate) {
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

    } else {  // no animation
      $container.classed('resizing', false);

      $sidebar
        .classed('collapsing', false)
        .classed('collapsed', endCollapsed)
        .style('flex-basis', `${expandWidth}px`);  // done resize, put expanded width back here

      ui.resize();
      this._storePreferences();
    }
  }


  /**
   * reset
   * Clears out any custom data that might be stored in the sidebar or child components.
   */
  reset() {
    if (this.$custom) {
      this.$custom.remove();
      this.$custom = null;
    }

    this.DataEditor.datum(null);
    this.DetectionInspector.datum(null);
    this.Inspector.entityIDs([]);
    this.KeepRightEditor.error(null);
    this.MapRouletteEditor.error(null);
    this.NoteEditor.note(null);
    this.OsmoseEditor.error(null);
    this.RapidInspector.datum = null;
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
   * @param  {Event} e? - triggering event (if any)
   */
  _eventCancel(e) {
    if (e)  e.preventDefault();
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


  /**
   * _setupKeybinding
   * This sets up the keybinding, replacing existing if needed
   */
  _setupKeybinding() {
    const context = this.context;
    const keybinding = context.keybinding();
    const l10n = context.systems.l10n;

    if (Array.isArray(this._keys)) {
      keybinding.off(this._keys);
    }

    // see iD#5663, iD#6864 - common QWERTY, AZERTY
    this._keys = [l10n.t('shortcuts.command.toggle_inspector.key'), '`', '²', '@'];
    context.keybinding().on(this._keys, this.toggle);
  }
}
