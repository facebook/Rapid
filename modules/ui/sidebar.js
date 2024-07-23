import { interpolateNumber as d3_interpolateNumber } from 'd3-interpolate';
import { select as d3_select } from 'd3-selection';
import { Extent } from '@rapid-sdk/math';
import { utilArrayIdentical } from '@rapid-sdk/util';
import _throttle from 'lodash-es/throttle.js';

import { osmEntity, osmNote, QAItem } from '../osm/index.js';
import { uiDataEditor } from './data_editor.js';
import { uiFeatureList } from './feature_list.js';
import { uiInspector } from './inspector.js';
import { uiKeepRightEditor } from './keepRight_editor.js';
import { uiMapRouletteEditor } from './maproulette_editor.js';
import { uiOsmoseEditor } from './osmose_editor.js';
import { uiNoteEditor } from './note_editor.js';
import { uiRapidFeatureInspector } from './rapid_feature_inspector.js';
import { utilFastMouse } from '../util/index.js';


/**
 * uiSidebar
 * The Sidebar is positioned to the side of the map and can show various information.
 * It can appear either on the left or right side of the map (depending on `l10n.isRTL`)
 * It is constructed like this:
 *
 *  <div class='sidebar'>
 *    <div class='sidebar-resizer'/>     // The resizer handle
 *    <div class='feature-list-pane'/>   // Feature list / search component
 *    <div class='inspecctor-wrap'/>     // Inspector - the components for working with OSM
 *    <div class='sidebar-component'/>   // Custom UI - everything else (Notes, Rapid, QA Icons, Save, etc)
 *  </div>
 *
 * While editing and interacting with the map, some sidebar components may be classed as hidden,
 * and custom components can be allowed to cover up the feature picker or OSM Inspector.
 */
export function uiSidebar(context) {
  const container = context.container();
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const ui = context.systems.ui;

  const inspector = uiInspector(context);
  const rapidInspector = uiRapidFeatureInspector(context);
  const dataEditor = uiDataEditor(context);
  const noteEditor = uiNoteEditor(context);
  const keepRightEditor = uiKeepRightEditor(context);
  const osmoseEditor = uiOsmoseEditor(context);
  const mapRouletteEditor = uiMapRouletteEditor(context);

  const minWidth = 240;

  let _featureListWrap = d3_select(null);
  let _inspectorWrap = d3_select(null);
  let _custom;
  let _sbar;
  let _resizer;
  let downPointerId, lastClientX, containerLocGetter;


  function sidebar(selection) {
    const dir = l10n.textDirection();
    let sidebarWidth;
    let containerWidth;
    let dragOffset;

    // add .sidebar
    _sbar = selection.selectAll('.sidebar')
      .data([dir]);

    _sbar.exit()
      .remove();

    const sbarEnter = _sbar.enter()
      .append('div')
      .attr('class', 'sidebar');

    _sbar = _sbar.merge(sbarEnter);


    // add .sidebar-resizer
    _resizer = selection.selectAll('.sidebar-resizer')
      .data([0]);

    const resizerEnter = _resizer.enter()
      .append('div')
      .attr('class', 'sidebar-resizer')
      .on('pointerdown.sidebar-resizer', _pointerdown)
      .on('dblclick', e => {
        e.preventDefault();
        if (e.sourceEvent) {
          e.sourceEvent.preventDefault();
        }
        sidebar.toggle();  // toggle sidebar when double-clicking the resizer
      });

    _resizer = _resizer.merge(resizerEnter);


    // add sidebar contents: feature list pane and inspector
    _featureListWrap = _sbar
      .append('div')
      .attr('class', 'feature-list-pane')
      .call(uiFeatureList(context));

    // _inspectorWrap = _sbar
      // .call(inspector);

    const keys = [l10n.t('sidebar.key'), '`', '²', '@'];  // iD#5663, iD#6864 - common QWERTY, AZERTY
    context.keybinding().off(keys);
    context.keybinding().on(keys, sidebar.toggle);


    /**
     * _hover
     * Hovers over the given map data
     * @param  {Array}  targets - Array of data to target, but only the first one is used currently
     */
    function _hover(targets) {
      const graph = editor.staging.graph;
      let datum = targets && targets.length && targets[0];

      if (datum?.__featurehash__) {   // hovering on data
        sidebar.show(dataEditor.datum(datum));
        _sbar.selectAll('.sidebar-component')
          .classed('inspector-hover', true);

      } else if (datum?.__fbid__) {   // hovering on Rapid data
        sidebar.show(rapidInspector.datum(datum));
        _sbar.selectAll('.sidebar-component')
          .classed('inspector-hover', true);

      } else if (datum instanceof osmNote) {
        if (context.mode?.id === 'drag-note') return;

        const service = context.services.osm;
        if (service) {
          datum = service.getNote(datum.id);   // marker may contain stale data - get latest
        }

        sidebar.show(noteEditor.note(datum));
        _sbar.selectAll('.sidebar-component')
          .classed('inspector-hover', true);

      } else if (datum instanceof QAItem) {
        const service = context.services[datum.service];
        let sidebarComponent;

        if (service) {
          datum = service.getError(datum.id);  // marker may contain stale data - get latest

          if (service.id === 'keepRight') {
            sidebarComponent = keepRightEditor;
          } else if (service.id === 'osmose') {
            sidebarComponent = osmoseEditor;
          } else if (service.id === 'maproulette') {
            sidebarComponent = mapRouletteEditor;
          }
        }

        if (sidebarComponent) {
          sidebar.show(sidebarComponent.error(datum));
        }

        _sbar.selectAll('.sidebar-component')
          .classed('inspector-hover', true);

      } else if (!_custom && (datum instanceof osmEntity) && graph.hasEntity(datum)) {
        _featureListWrap
          .classed('inspector-hidden', true);

        _inspectorWrap
          .classed('inspector-hidden', false)
          .classed('inspector-hover', true);

        if (!inspector.entityIDs() || !utilArrayIdentical(inspector.entityIDs(), [datum.id]) || inspector.state() !== 'hover') {
          inspector
            .state('hover')
            .entityIDs([datum.id])
            .newFeature(false);

          _sbar
            .call(inspector);
        }

      } else if (!_custom) {
        _featureListWrap.classed('inspector-hidden', false);
        _inspectorWrap.classed('inspector-hidden', true);
        inspector.state('hide');

      } else {
        sidebar.hide();
      }
    }


    /**
     * hover
     * Hovers over the given targets
     * This just wraps the internal `_hover` in a throttle to keep it from being called too frequently.
     * @param  {Array}  targets - Array of data to target, but only the first one is used currently
     */
    sidebar.hover = _throttle(_hover, 200);


    /**
     * intersects
     * Test if the sidebar is covering up the given extent
     * @param  {Extent}   wgs84Extent - an Extent in lon/lat coordinates
     * @return `true` if the sidebar is intersecting the Extent, `false` if not
     */
    sidebar.intersects = function(wgs84Extent) {
      const rect = _sbar.node().getBoundingClientRect();
      return wgs84Extent.intersects(new Extent(
        context.viewport.unproject([0, rect.height]),
        context.viewport.unproject([rect.width, 0])
      ));
    };


    /**
     * select
     * Selects the given ids - they are expected to be OSM IDs already loaded (in the Graph)
     * @param  {Array}    ids - ids to select (expected to be OSM IDs)
     * @param  {boolean}  newFeature - true if it's a new feature, passed to the inspector
     */
    sidebar.select = function(ids, newFeature) {
      sidebar.hide();

      if (ids && ids.length) {
        const graph = editor.staging.graph;
        const entity = ids.length === 1 && graph.entity(ids[0]);

        if (entity && newFeature && _sbar.classed('collapsed')) {
          // uncollapse the sidebar
          const extent = entity.extent(graph);
          sidebar.expand(sidebar.intersects(extent));
        }

        _featureListWrap
          .classed('inspector-hidden', true);

        _inspectorWrap
          .classed('inspector-hidden', false)
          .classed('inspector-hover', false);

        // Reload the UI even if the ids are the same since the entities
        // themselves may have changed
        inspector
          .state('select')
          .entityIDs(ids)
          .newFeature(newFeature);

      } else {
        inspector
          .entityIDs([])
          .state('hide');
      }

      _sbar
        .call(inspector);
    };


    /**
     * showPresetList
     * Shows inspector open to Preset List
     */
    sidebar.showPresetList = function(...args) {
      inspector.showPresetList(...args);
    };


    /**
     * showEntityEditor
     * Shows inspector open to Entity Editor
     */
    sidebar.showEntityEditor = function(...args) {
      inspector.showEntityEditor(...args);
    };


    /**
     * show
     * Shows some "custom" content in the sidebar
     * This is how almost all content renders to the sidebar
     * (except for the OSM editing "inspector", which is special)
     */
    sidebar.show = function(renderFn) {
      _featureListWrap.classed('inspector-hidden', true);
      _inspectorWrap.classed('inspector-hidden', true);

      if (_custom)  _custom.remove();
      _custom = _sbar
        .append('div')
        .attr('class', 'sidebar-component')
        .call(renderFn);
    };


    /**
     * hide
     * Removes all "custom" content in the sidebar
     */
    sidebar.hide = function() {
      _featureListWrap.classed('inspector-hidden', false);
      _inspectorWrap.classed('inspector-hidden', true);

      if (_custom)  _custom.remove();
      _custom = null;
    };


    /**
     * expand
     * Expands the sidebar
     */
    sidebar.expand = function(moveMap) {
      if (_sbar.classed('collapsed')) {
        sidebar.toggle(moveMap);
      }
    };


    /**
     * collapse
     * Collapses the sidebar
     */
    sidebar.collapse = function(moveMap) {
      if (!_sbar.classed('collapsed')) {
        sidebar.toggle(moveMap);
      }
    };


    /**
     * toggle
     * Toggles the sidebar between expanded/collapsed states
     */
    sidebar.toggle = function(moveMap) {
      // Don't allow sidebar to toggle when the user is in the walkthrough.
      if (context.inIntro) return;

      const isCollapsed = _sbar.classed('collapsed');
      const isCollapsing = !isCollapsed;
      const isRTL = l10n.isRTL();
      const scaleX = isRTL ? 0 : 1;
      const xMarginProperty = isRTL ? 'margin-right' : 'margin-left';

      sidebarWidth = _sbar.node().getBoundingClientRect().width;

      // switch from % to px
      _sbar.style('width', `${sidebarWidth}px`);

      let startMargin, endMargin, lastMargin;
      if (isCollapsing) {
        startMargin = lastMargin = 0;
        endMargin = -sidebarWidth;
      } else {
        startMargin = lastMargin = -sidebarWidth;
        endMargin = 0;
      }

      if (!isCollapsing) {
        // unhide the sidebar's content before it transitions onscreen
        _sbar.classed('collapsed', isCollapsing);
      }

      _sbar
        .transition()
        .style(xMarginProperty, endMargin + 'px')
        .tween('panner', function() {
          let i = d3_interpolateNumber(startMargin, endMargin);
          return function(t) {
            let dx = lastMargin - Math.round(i(t));
            lastMargin = lastMargin - dx;
            ui.resize(moveMap ? undefined : [dx * scaleX, 0]);
          };
        })
        .on('end', function() {
          if (isCollapsing) {
            // hide the sidebar's content after it transitions offscreen
            _sbar.classed('collapsed', isCollapsing);
          }
          // switch back from px to %
          if (!isCollapsing) {
            const containerWidth = container.node().getBoundingClientRect().width;
            const widthPct = (sidebarWidth / containerWidth) * 100;
            _sbar
              .style(xMarginProperty, null)
              .style('width', widthPct + '%');
          }
        });
    };


    function _pointerdown(d3_event) {
      if (downPointerId) return;

      if ('button' in d3_event && d3_event.button !== 0) return;

      downPointerId = d3_event.pointerId || 'mouse';

      lastClientX = d3_event.clientX;

      containerLocGetter = utilFastMouse(container.node());

      // offset from edge of sidebar-resizer
      dragOffset = utilFastMouse(_resizer.node())(d3_event)[0] - 1;

      sidebarWidth = _sbar.node().getBoundingClientRect().width;
      containerWidth = container.node().getBoundingClientRect().width;
      const widthPct = (sidebarWidth / containerWidth) * 100;
      _sbar
        .style('width', `${widthPct}%`)    // lock in current width
        .style('max-width', '85%');        // but allow larger widths

      _resizer.classed('dragging', true);

      d3_select(window)
        .on('touchmove.sidebar-resizer', function(d3_event) {
          // disable page scrolling while resizing on touch input
          d3_event.preventDefault();
        }, { passive: false })
        .on('pointermove.sidebar-resizer', _pointermove)
        .on('pointerup.sidebar-resizer pointercancel.sidebar-resizer', _pointerup);
    }


    function _pointermove(d3_event) {
      if (downPointerId !== (d3_event.pointerId || 'mouse')) return;

      d3_event.preventDefault();

      const dx = d3_event.clientX - lastClientX;

      lastClientX = d3_event.clientX;

      const isRTL = l10n.isRTL();
      const scaleX = isRTL ? 0 : 1;
      const xMarginProperty = isRTL ? 'margin-right' : 'margin-left';

      const x = containerLocGetter(d3_event)[0] - dragOffset;
      sidebarWidth = isRTL ? containerWidth - x : x;

      const isCollapsed = _sbar.classed('collapsed');
      const shouldCollapse = sidebarWidth < minWidth;

      _sbar.classed('collapsed', shouldCollapse);

      if (shouldCollapse) {
        if (!isCollapsed) {
          _sbar
            .style(xMarginProperty, '-400px')
            .style('width', '400px');

          ui.resize([(sidebarWidth - dx) * scaleX, 0]);
        }

      } else {
        const widthPct = (sidebarWidth / containerWidth) * 100;
        _sbar
          .style(xMarginProperty, null)
          .style('width', widthPct + '%');

        if (isCollapsed) {
          ui.resize([-sidebarWidth * scaleX, 0]);
        } else {
          ui.resize([-dx * scaleX, 0]);
        }
      }
    }


    function _pointerup(d3_event) {
      if (downPointerId !== (d3_event.pointerId || 'mouse')) return;

      downPointerId = null;

      _resizer.classed('dragging', false);

      d3_select(window)
        .on('touchmove.sidebar-resizer', null)
        .on('pointermove.sidebar-resizer', null)
        .on('pointerup.sidebar-resizer pointercancel.sidebar-resizer', null);
    }
  }

  sidebar.showPresetList = function() {};
  sidebar.showEntityEditor = function() {};
  sidebar.hover = function() {};
  sidebar.hover.cancel = function() {};
  sidebar.intersects = function() {};
  sidebar.select = function() {};
  sidebar.show = function() {};
  sidebar.hide = function() {};
  sidebar.expand = function() {};
  sidebar.collapse = function() {};
  sidebar.toggle = function() {};

  return sidebar;
}
