import { selection } from 'd3-selection';

import { uiIcon } from '../icon.js';
import { uiTooltip } from '../tooltip.js';


/**
 * UiZoomToControl
 */
export class UiZoomToControl {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    const l10n = context.systems.l10n;

    this.key = l10n.t('inspector.zoom_to.key');
    this._prevTransform = null;   // After a zoom in, the previous transform to zoom back out

    // Create child components
    this.Tooltip = uiTooltip(context);

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.isDisabled = this.isDisabled.bind(this);
    this.render = this.render.bind(this);
    this.modechange = this.modechange.bind(this);
    this.zoomTo = this.zoomTo.bind(this);

    // Event listeners
    context.on('modechange', this.modechange);
    context.keybinding().on(this.key, this.zoomTo);
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

    let $button = $parent.selectAll('button')
      .data([0]);

    // enter
    const $$button = $button.enter()
      .append('button')
      .attr('class', 'zoom-to-selection')
      .on('click', this.zoomTo)
      .call(this.Tooltip)
      .call(uiIcon('#rapid-icon-framed-dot', 'light'));

    // update
    $button = $button.merge($$button);

    $button
      .classed('disabled', this.isDisabled);

    // Update tooltip
    this.Tooltip
      .placement(l10n.isRTL() ? 'right' : 'left')
      .title(() => this.isDisabled() ? l10n.t('inspector.zoom_to.no_selection') : l10n.t('inspector.zoom_to.title'))
      .shortcut(this.key);
  }


  /**
   * isDisabled
   * The button is disabled if there is nothing selected that the user can zoom in to (or out from).
   * @return  {boolean}  `true` if the button disabled, `false` if not
   */
  isDisabled() {
    const context = this.context;
    return !this._prevTransform && !context.mode?.extent;
  }


  /**
   * modechange
   * When changing modes, reset the previous transform and rerender
   */
  modechange() {
    this._prevTransform = null;
    this.render();
  }


  /**
   * zoomTo
   * This zooms in on the selected feature(s), or unzooms out from them
   * @param  {Event}  e? - the triggering event, if any (keypress or click)
   */
  zoomTo(e) {
    if (e)  e.preventDefault();

    const context = this.context;
    const extent = context.mode?.extent;
    const map = context.systems.map;

    if (this._prevTransform) {   // pop back out
      map.transformEase(this._prevTransform);
      this._prevTransform = null;

    } else if (extent) {   // zoom in on extent
      const viewport = context.viewport;
      this._prevTransform = viewport.transform.props;
      const z = map.extentZoom(extent, viewport.center());
      map.centerZoomEase(extent.center(), z);

    } else {   // button disabled
      //  // consider: there are no tooltips for touch interactions so flash feedback instead
      //  if (_lastPointerUpType === 'touch' || _lastPointerUpType === 'pen') {
      //    ui.Flash
      //      .duration(2000)
      //      .iconName('#rapid-icon-framed-dot')
      //      .iconClass('disabled')
      //      .label(l10n.t('inspector.zoom_to.no_selection'))();
      //  }
    }
  }

}
