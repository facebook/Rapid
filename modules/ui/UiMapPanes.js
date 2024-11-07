import { selection, select } from 'd3-selection';

import {
  uiPaneBackground, uiPaneHelp, uiPaneIssues, uiPaneMapData, uiPanePreferences
} from './panes/index.js';


/**
 * UiMapPanes
 * This component the map panes section for drawers like:
 *  Background, Map Data, Issues, Preferences, Help
 */
export class UiMapPanes {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    // Create child components
    this.Background = uiPaneBackground(context);
    this.MapData = uiPaneMapData(context);
    this.Issues = uiPaneIssues(context);
    this.Preferences = uiPanePreferences(context);
    this.Help = uiPaneHelp(context);

    this.panes = [
      this.Background,
      this.MapData,
      this.Issues,
      this.Preferences,
      this.Help
    ];

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
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

    let $panes = $parent.selectAll('.map-panes')
      .data([0]);

    // enter
    const $$panes = $panes.enter()
      .append('div')
      .attr('class', 'map-panes');

    // Add the panes (enter only)
    $$panes.selectAll('.map-pane')
      .data(this.panes, d => d.id)
      .enter()
      .each((d, i, nodes) => {
        select(nodes[i]).call(d.renderPane);
      });

    // Also add the pane toggle buttons to the map controls div (enter only)
    const $mapControls = $parent.selectAll('.map-controls');

    $mapControls.selectAll('.map-pane-control')
      .data(this.panes, d => d.id)
      .enter()
      .each((d, i, nodes) => {
        select(nodes[i]).call(d.renderToggleButton);
      });
  }

}
