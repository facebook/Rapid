import { selection } from 'd3-selection';
import { interpolateRgb } from 'd3-interpolate';

import { uiIcon } from '../icon.js';
import { uiTooltip } from '../tooltip.js';
import { utilCmd } from '../../util/cmd.js';


/**
 * UiSaveTool
 * A toolbar section for the save button
 */
export class UiSaveTool {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;
    this.id = 'save';
    this.stringID = 'save.title';
    this.key = utilCmd('⌘S');

    this._numChanges = 0;

    // Create child components
    this.Tooltip = uiTooltip(context);

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.choose = this.choose.bind(this);
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument

    // Event listeners
    const editor = context.systems.editor;
    context.on('modechange', this.rerender);
    editor.on('stablechange', this.rerender);
    context.keybinding().on(this.key, this.choose, true /* capture */);
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
    const editor = context.systems.editor;
    const l10n = context.systems.l10n;
    const numChanges = editor.difference().summary().size;

    this.Tooltip
      .placement('bottom')
      .scrollContainer(context.container().select('.map-toolbar'))
      .title(l10n.t(numChanges > 0 ? 'save.help' : 'save.no_changes'))
      .shortcut(this.key);

    // Button
    let $button = $parent.selectAll('button.save')
      .data([0]);

    // enter
    const $$button = $button.enter()
      .append('button')
      .attr('class', 'save disabled bar-button')
      .on('click', this.choose)
      .call(this.Tooltip)
      .call(uiIcon('#rapid-icon-save'));

    $$button
      .append('span')
      .attr('class', 'count')
      .attr('aria-hidden', 'true')
      .text('0');

    // update
    $button = $button.merge($$button);

    $button
      .classed('disabled', this.isDisabled())
      .style('background', this.bgColor(numChanges));

    $button.selectAll('span.count')
      .text(numChanges);

    if (this.isSaving()) {
      $button.call(this.Tooltip.hide);
    }
  }


  /**
   * isSaving
   * Is the user currently already saving?
   * @return  {boolean}  `true` if saving, `false` if not
   */
  isSaving() {
    const context = this.context;
    return context.mode?.id === 'save';
  }


  /**
   * isDisabled
   * The button is disabled when there are no user changes to save
   * @return  {boolean}  `true` if disabled, `false` if enabled
   */
  isDisabled() {
    const context = this.context;
    const editor = context.systems.editor;
    return (context.inIntro || !editor.hasChanges() || this.isSaving());
  }


  /**
   * choose
   * @param  {Event} e? - triggering event (if any)
   */
  choose(e) {
    if (e)  e.preventDefault();
    if (this.isDisabled()) return;

    //  // consider: there are no tooltips for touch interactions so flash feedback instead
    // if (isDisabled) {
    //   context.systems.ui.Flash
    //     .duration(2000)
    //     .iconName('#rapid-icon-save')
    //     .iconClass('disabled')
    //     .label(l10n.t('save.no_changes'))();
    // }
    // lastPointerUpType = null;

    this.context.enter('save');
  }


  /**
   * bgColor
   * Choose a background color that gets increasingly red to remind the use to save.
   */
  bgColor(numChanges) {
    let step;
    if (numChanges === 0) {
      return null;
    } else if (numChanges <= 50) {
      step = numChanges / 50;
      return interpolateRgb('#fff', '#ff8')(step);  // white -> yellow
    } else {
      step = Math.min((numChanges - 50) / 50, 1.0);
      return interpolateRgb('#ff8', '#f88')(step);  // yellow -> red
    }
  }

}
