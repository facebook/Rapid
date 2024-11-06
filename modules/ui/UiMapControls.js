import { selection, select } from 'd3-selection';

import {
  UiBearingControl, UiGeolocateControl, UiZoomControl, UiZoomToControl
} from './controls/index.js';


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
    this.BearingControl = new UiBearingControl(context);
    this.ZoomControl = new UiZoomControl(context);
    this.ZoomToControl = new UiZoomToControl(context);
    this.GeolocateControl = new UiGeolocateControl(context);

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
      { control: this.BearingControl, klass: 'bearing' },
      { control: this.ZoomControl, klass: 'zoombuttons' },
      { control: this.ZoomToControl, klass: 'zoom-to-selection' },
      { control: this.GeolocateControl, klass: 'geolocate' }
    ];

    let $controls = $container.selectAll('.map-control')
      .data(components, d => d.klass);

    // enter
    const $$controls = $controls.enter()
      .append('div')
      .attr('class', d => `map-control ${d.klass}`);

    // update
    $controls = $controls.merge($$controls);

    $controls
      .each((d, i, nodes) => {
        select(nodes[i]).call(d.control.render);  // render
      });
  }

}
