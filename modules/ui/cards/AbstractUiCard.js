/**
 * "Cards" are user interface elements that can float on top of the map
 * and provide extra information about the map or the selection.
 *
 * `AbstractUiCard` is the base class from which all UI Cards inherit.
 *
 * Properties you can access:
 *   `enabled`  `true` if the card is enabled, `false` if not.
 */
export class AbstractUiCard {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this._isVisible = false;

    // D3 selections
    this.$parent = null;
    this.$wrap = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.show = this.show.bind(this);
    this.hide = this.hide.bind(this);
    this.toggle = this.toggle.bind(this);
  }


  /**
   * visible
   * @readonly
   */
  get visible() {
    return this._isVisible;
  }


  /**
   * show
   * Shows the component
   * @param  {Event} e - event that triggered the show (if any)
   */
  show(e) {
    if (e) e.preventDefault();

    if (this._isVisible) {  // already visible
      this.render();        // just rerender
      return;
    }

    this._isVisible = true;
    this.render();
    if (!this.$wrap) return;   // shouldn't happen?

    this.$wrap
      .interrupt()
      .style('display', null)
      .style('opacity', '0')
      .transition()
      .duration(200)
      .style('opacity', '1');
  }


  /**
   * hide
   * Hides the component
   * @param  {Event} e - event that triggered the hide (if any)
   */
  hide(e) {
    if (e) e.preventDefault();

    if (!this.$wrap) return;        // called too early?
    if (!this._isVisible) return;   // already invisible

    this._isVisible = false;

    this.$wrap
      .interrupt()
      .transition()
      .duration(200)
      .style('opacity', '0')
      .on('end', () => this.$wrap.style('display', 'none'));
  }


  /**
   * toggle
   * Toggles the component between shown/hidden
   * @param  {Event} e - event that triggered the toggle (if any)
   */
  toggle(e) {
    if (this._isVisible) {
      this.hide(e);
    } else {
      this.show(e);
    }
  }

}
