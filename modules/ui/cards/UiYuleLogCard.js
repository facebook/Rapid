import { selection } from 'd3-selection';
import debounce from 'lodash-es/debounce';

import { AbstractUiCard } from './AbstractUiCard';
import { uiIcon } from '../icon.js';
import { utilCmd } from '../../util/cmd.js';



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
    this.label = l10n.tHtml('info_panels.yule_log.title');
    this.key = l10n.t('info_panels.yule_log.key');

    this._setupKeybinding = this._setupKeybinding.bind(this);

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this._deferredRender = debounce(this.render, 250);

    l10n
    .on('localechange', this._setupKeybinding);

    this._setupKeybinding();
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

    if (!this.visible) return;

    // .card-container
    let $wrap = $parent.selectAll('.card-container')
      .data([this.id], d => d);

    // enter
    const $$wrap = $wrap.enter()
      .append('div')
      .attr('class', d => `fillD2 card-container card-container-${d}`);

    const $$title = $$wrap
      .append('div')
      .attr('class', 'fillD2 card-title');

    $$title
      .append('h3');

    $$title
      .append('button')
      .attr('class', 'close')
      .on('click', this.toggle)
      .call(uiIcon('#rapid-icon-close'));

    $$wrap
      .append('div')
      .attr('class', d => `card-content card-content-${d}`)
      .append('ul')
      .attr('class', 'yule-log');

    // update
    this.$wrap = $wrap = $wrap.merge($$wrap);

    $wrap.selectAll('h3')
      .text(l10n.t('info_panels.yule_log.title'));

  }


  /**
   * _setupKeybinding
   * This sets up the keybinding, replacing existing if needed
   */
  _setupKeybinding() {
    const context = this.context;
    const keybinding = context.keybinding();
    const l10n = context.systems.l10n;

    if (Array.isArray(this._keys)) {
      keybinding.off(this._keys);
    }

    this._keys = [utilCmd('⌘⇧' + l10n.t('shortcuts.command.toggle_yule_log.key'))];
    context.keybinding().on(this._keys, this.toggle);
  }
}
