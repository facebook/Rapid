import { selection } from 'd3-selection';

/**
 * UiMap3dViewer
 * A wrapper for the 3dMap
 * Someday we should make this more like the photoviewer
 */
export class UiMap3dViewer {

  /**
   * @constructor
   * @param  `conttext`  Global shared application context
   */
  constructor(context) {
    this.context = context;

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

    const map3d = this.context.systems.map3d;
    const containerID = map3d.containerID;

    $parent.selectAll(`#${containerID}`)
      .data([0])
      .enter()
      .append('div')
      .attr('id', containerID)
      .style('display', 'none');
  }
}
