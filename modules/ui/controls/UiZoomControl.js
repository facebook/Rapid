import { select, selection } from 'd3-selection';

import { uiIcon } from '../icon.js';
import { uiTooltip } from '../tooltip.js';
import { utilCmd, utilKeybinding } from '../../util/index.js';


/**
 * UiZoomControl
 */
export class UiZoomControl {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    const l10n = context.systems.l10n;
    const map = context.systems.map;

    // Create child components
    this.Tooltip = uiTooltip(context);

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument
    this.zoomIn = this.zoomIn.bind(this);
    this.zoomOut = this.zoomOut.bind(this);
    this.zoomInFurther = this.zoomInFurther.bind(this);
    this.zoomOutFurther = this.zoomOutFurther.bind(this);

    this.zooms = [{
      id: 'zoom-in',
      icon: 'rapid-icon-plus',
      key: '+',
      action: this.zoomIn,
      isDisabled: () => !map.canZoomIn(),
      getTitle: () => l10n.t('zoom.in'),
      getDisabledTitle: () => l10n.t('zoom.disabled.in')
    }, {
      id: 'zoom-out',
      icon: 'rapid-icon-minus',
      key: '-',
      action: this.zoomOut,
      isDisabled: () => !map.canZoomOut(),
      getTitle: () => l10n.t('zoom.out'),
      getDisabledTitle: () => l10n.t('zoom.disabled.out')
    }];

    // Event listeners
    utilKeybinding.plusKeys.forEach(key => {
      context.keybinding().on(key, this.zoomIn);
      context.keybinding().on(utilCmd('⌥' + key), this.zoomInFurther);
    });

    utilKeybinding.minusKeys.forEach(key => {
      context.keybinding().on(key, this.zoomOut);
      context.keybinding().on(utilCmd('⌥' + key), this.zoomOutFurther);
    });

    map.on('draw', this.rerender);
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

    let $buttons = $parent.selectAll('button')
      .data(this.zooms);

    // enter
    const $$buttons = $buttons.enter()
      .append('button')
      .attr('class', d => d.id)
      .on('click', (e, d) => {
        if (!d.isDisabled()) {
          d.action(e);
        }
      })
      .call(this.Tooltip)
      .each((d, i, nodes) => {
        select(nodes[i])
          .call(uiIcon(`#${d.icon}`, 'light'));
      });

    // update
    $buttons = $buttons.merge($$buttons);

    $buttons
      .classed('disabled', d => d.isDisabled());

    // Update tooltip
    this.Tooltip
      .placement(l10n.isRTL() ? 'right' : 'left')
      .title(d => d.isDisabled() ? d.getDisabledTitle() : d.getTitle())
      .shortcut(d => d.key);

    $buttons
      .each((d, i, nodes) => {
        const $button = select(nodes[i]);
        if (!$button.select('.tooltip.in').empty()) {
          $button.call(this.Tooltip.updateContent);
        }
      });
  }


  /**
   * zoomIn
   * @param  {Event} e? - triggering event (if any)
   */
  zoomIn(e) {
    if (e)  e.preventDefault();
    const map = this.context.systems.map;
    map.zoomIn();
  }

  /**
   * zoomOut
   * @param  {Event} e? - triggering event (if any)
   */
  zoomOut(e) {
    if (e)  e.preventDefault();
    const map = this.context.systems.map;
    map.zoomOut();
  }

  /**
   * zoomInFurther
   * @param  {Event} e? - triggering event (if any)
   */
  zoomInFurther(e) {
    if (e)  e.preventDefault();
    const map = this.context.systems.map;
    map.zoomInFurther();
  }

  /**
   * zoomOutFurther
   * @param  {Event} e? - triggering event (if any)
   */
  zoomOutFurther(e) {
    if (e)  e.preventDefault();
    const map = this.context.systems.map;
    map.zoomOutFurther();
  }
}
