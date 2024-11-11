import { selection } from 'd3-selection';


/**
 * UiSourceSwitch
 * This component adds the source switcher control to the footer.
 */
export class UiSourceSwitch {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this._isLive = true;  // default to live

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument
    this.toggle = this.toggle.bind(this);
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
    const keys = context.apiConnections;
    const l10n = context.systems.l10n;
    const showSourceSwitcher = (Array.isArray(keys) && keys.length === 2);

    // Create/remove wrapper div if necessary
    let $wrap = $parent.selectAll('.source-switch')
      .data(showSourceSwitcher ? [0] : []);

    $wrap.exit()
      .remove();

    const $$wrap = $wrap.enter()
      .append('div')
      .attr('class', 'source-switch');

    $$wrap
      .append('a')
      .attr('href', '#')
      .attr('class', 'source-switch-link')
      .on('click', this.toggle);

    // update
    $wrap = $wrap.merge($$wrap);

    $wrap.selectAll('.source-switch-link')
      .classed('live', this._isLive)
      .classed('chip', this._isLive)
      .text(this._isLive ? l10n.t('source_switch.live') : l10n.t('source_switch.dev'));
  }


  /**
   * toggle
   * Toggles between live and dev database
   * @param  {Event} e - event that triggered the toggle (if any)
   */
  toggle(e) {
    if (e)  e.preventDefault();

    const context = this.context;
    const editor = context.systems.editor;
    const keys = context.apiConnections;
    const l10n = context.systems.l10n;
    const osm = context.services.osm;

    if (!osm) return;
    if (context.inIntro) return;
    if (context.mode?.id === 'save') return;
    if (!Array.isArray(keys) || keys.length !== 2) return;

    if (editor.hasChanges() && !window.confirm(l10n.t('source_switch.lose_changes'))) return;

    this._isLive = !this._isLive;

    context.enter('browse');
    editor.clearBackup();  // remove saved history

    context.resetAsync()   // remove downloaded data
      .then(() => osm.switchAsync(this._isLive ? keys[0] : keys[1]))
      .then(this.rerender);
  }

}
