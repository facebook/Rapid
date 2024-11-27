import { selection } from 'd3-selection';
import { vecRotate } from '@rapid-sdk/math';

import { uiIcon } from '../icon.js';
import { uiTooltip } from '../tooltip.js';


/**
 * UiBearingControl
 */
export class UiBearingControl {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    // Create child components
    this.Tooltip = uiTooltip(context)
      .shortcut('⇧ ');  // hack, we will replace the space with the arrow keys icon

    // D3 selections
    this.$parent = null;
    this.$button = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.resetBearing = this.resetBearing.bind(this);
    this.updateBearing = this.updateBearing.bind(this);

    // Event listeners
    context.systems.map
      .on('draw', this.updateBearing);
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
      .attr('class', 'bearing')
      .on('click', this.resetBearing);

    $$button
      .append('div')
      .attr('class', 'bearing_n');

    $$button
      .call(this.Tooltip)
      .call(uiIcon('#rapid-icon-compass', 'light'));

    // update
    this.$button = $button = $button.merge($$button);

    // Update tooltip
    this.Tooltip
      .placement(l10n.isRTL() ? 'right' : 'left')
      .title(l10n.t('bearing.reset_bearing'));

    // Insert a better keyhint
    this.Tooltip.updateContent();  // call this first, in order to be able to select `.tooltip-keyhint`
    $button.selectAll('.tooltip-keyhint')
      .selectAll('.rotate-the-map')
      .data([0])
      .enter()
      .insert('div', '.tooltip-keys')
      .attr('class', 'rotate-the-map');

    $button.selectAll('.tooltip-keys > kbd.shortcut:last-of-type')
      .classed('hide', true);  // remove the space

    $button.selectAll('.tooltip-keys')
      .call(uiIcon('#rapid-interaction-keyboard-arrows-left-right', 'operation'));

    $button.selectAll('.rotate-the-map')
      .text(l10n.t('bearing.rotate_the_map'));

    $button.selectAll('.bearing_n')
      .text(l10n.t('bearing.n'));  // the letter 'N'

    this.updateBearing();
  }


  /**
   * updateBearing
   * Updates the rotation of the compass pointer to match the rotation of the map.
   */
  updateBearing() {
    const $button = this.$button;
    if (!$button) return;   // called too early?

    const context = this.context;
    const rot = context.viewport.transform.rotation;
    const isNorthUp = (rot === 0);

    // Translate the 'N' around opposite of the compass pointer
    const npos = vecRotate([0, 8], rot, [0, 0]);
    $button.selectAll('.bearing_n')
      .style('transform', `translate(${npos[0]}px, ${npos[1]}px)`);

    // Select direct descendant compass icon only (not the tooltip-keys icon!)...
    // Because `d3.selectAll` uses `element.querySelectorAll`, `:scope` refers to self
    // see https://developer.mozilla.org/en-US/docs/Web/CSS/:scope
    $button.selectAll(':scope > .icon use')
      .style('transform-origin', isNorthUp ? null : 'center')
      .style('transform', isNorthUp ? null : `rotate(${rot}rad)`);
  }


  /**
   * resetBearing
   * @param  {Event} e? - triggering event (if any)
   */
  resetBearing(e) {
    if (e)  e.preventDefault();

    const context = this.context;
    const map = context.systems.map;
    const t = context.viewport.transform.props;

    if (t.r !== 0) {
      map.transformEase(Object.assign(t, { r: 0 }));
    }
  }
}
