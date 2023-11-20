import { select as d3_select } from 'd3-selection';
import debounce from 'lodash-es/debounce';

import { AbstractUiCard } from './AbstractUiCard';



/**
 * UiYuleLogCard
 */
export class UiYuleLogCard extends AbstractUiCard {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'yule_log';

    const l10n = context.systems.l10n;
    this.label = l10n.tHtml('info_panels.toggle_yule_log.title');
    this.key = l10n.t('info_panels.yule_log.key');

    this._selection = d3_select(null);

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this._deferredRender = debounce(this.render, 250);
  }


  /**
   * enable
   * @param  `selection`  A d3-selection to a `div` that the panel should render itself into
   */
  enable(selection) {
    if (this._enabled) return;

    this._enabled = true;
  }


  /**
   * disable
   */
  disable() {
    if (!this._enabled) return;

    this._selection.html('');  // empty DOM

    this._enabled = false;
    this._selection = d3_select(null);
    this._currSourceID = null;
    this._metadata = {};
  }


  /**
   * render
   */
  render() {
    if (!this._enabled) return;

    const selection = this._selection;

    // Empty out the DOM content and rebuild from scratch..
    selection.html('');

    selection
      .append('ul')
      .attr('class', 'yule-log');
  }
}
