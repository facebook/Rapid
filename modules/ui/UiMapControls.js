import { selection, select } from 'd3-selection';

import { uiBearing } from './bearing.js';
import { uiGeolocate } from './geolocate.js';
import { uiZoom } from './zoom.js';
import { uiZoomToSelection } from './zoom_to_selection.js';


/**
 * UiMapControls
 * This component creates the map controls bar
 * (bearing, zoom in, zoom out, zoom to selection, geolocate)
 */
export class UiMapControls {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    // Create child components
    this.Bearing = uiBearing(context);
    this.Zoom = uiZoom(context);
    this.ZoomToSelection = uiZoomToSelection(context);
    this.Geolocate = uiGeolocate(context);

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

    // .map-controls container
    let $container = $parent.selectAll('.map-controls')
      .data([0]);

    const $$container = $container.enter()
      .append('div')
      .attr('class', 'map-controls');

    $container = $container.merge($$container);


    // Map Controls
    const components = [
      { id: 'bearing', control: this.Bearing },
      { id: 'zoombuttons', control: this.Zoom },
      { id: 'zoom-to-selection', control: this.ZoomToSelection },
      { id: 'geolocate', control: this.Geolocate }
    ];

    let $controls = $container.selectAll('.map-control')
      .data(components, d => d.id);

    // enter
    const $$controls = $controls.enter()
      .append('div')
      .attr('class', d => `map-control ${d.id}`);

    // update
    $controls = $controls.merge($$controls);

    $controls
      .each((d, i, nodes) => {
        select(nodes[i]).call(d.control);  // render
      });
  }

}
