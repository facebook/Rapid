import { selection, select as d3_select } from 'd3-selection';

import { uiAttribution, uiBearing, uiGeolocate, uiMap3dViewer, uiZoom, uiZoomToSelection } from './index.js';
import { uiPaneBackground, uiPaneHelp, uiPaneIssues, uiPaneMapData, uiPanePreferences } from './panes/index.js';


/**
 * UiOvermap
 * This component creates the middle section for any UI elements that float over the map
 *
 * @example
 * <div class='over-map'>
 *   // Lots of things live in here..
 *   // Minimap, map controls, map panels, info panels, photo viewer
 *   …
 * </div>
 */
export class UiOvermap {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    // Create child components

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument
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
    const ui = context.systems.ui;

    let $overmap = $parent.selectAll('.over-map')
      .data([0]);

    // enter
    const $$overmap = $overmap.enter()
      .append('div')
      .attr('class', 'over-map');

    // HACK: Mobile Safari 14 likes to select anything selectable when long-
    // pressing, even if it's not targeted. This conflicts with long-pressing
    // to show the edit menu. We add a selectable offscreen element as the first
    // child to trick Safari into not showing the selection UI.
    $$overmap
      .append('div')
      .attr('class', 'select-trap')
      .text('t');

    $$overmap
      .call(ui.mapInMap.render);

    $$overmap
      .call(uiMap3dViewer(context));

    $$overmap
      .call(ui.spector.render);


    // Map controls
    const $$controls = $$overmap
      .append('div')
      .attr('class', 'map-controls');

    $$controls
      .append('div')
      .attr('class', 'map-control bearing')
      .call(uiBearing(context));

    $$controls
      .append('div')
      .attr('class', 'map-control zoombuttons')
      .call(uiZoom(context));

    $$controls
      .append('div')
      .attr('class', 'map-control zoom-to-selection')
      .call(uiZoomToSelection(context));

    $$controls
      .append('div')
      .attr('class', 'map-control geolocate')
      .call(uiGeolocate(context));


    // Panes
    $$overmap
      .append('div')
      .attr('class', 'map-panes')
      .each((d, i, nodes) => {
        const $$selection = d3_select(nodes[i]);

        // Instantiate the panes
        const uiPanes = [
          uiPaneBackground(context),
          uiPaneMapData(context),
          uiPaneIssues(context),
          uiPanePreferences(context),
          uiPaneHelp(context)
        ];

        // For each pane, create the buttons to toggle the panes,
        // and perform a single render to append it to the map-panes div
        for (const Component of uiPanes) {
          $$controls
            .append('div')
            .attr('class', `map-control map-pane-control ${Component.id}-control`)
            .call(Component.renderToggleButton);

          $$selection
            .call(Component.renderPane);
        }
      });


    // Info Panels
    $$overmap
      .call(ui.info);

    $$overmap
      .append('div')
      .attr('class', 'photoviewer')
      .classed('al', true)       // 'al'=left,  'ar'=right
      .classed('hide', true)
      .call(ui.photoviewer.render);

    $$overmap
      .append('div')
      .attr('class', 'attribution-wrap')
      .attr('dir', 'ltr')
      .call(uiAttribution(context));
  }

}
