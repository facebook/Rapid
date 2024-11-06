import { utilCmd, utilDetect } from '../util/index.js';


/**
 * UiFullscreen
 * This component just adds fullscreen key bindings.
 */
export class UiFullscreen {

  /**
   * @constructor
   * @param  `conttext`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    // D3 selections
    this.$parent = null;
    // this.$button = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.toggle = this.toggle.bind(this);
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders)
   * @param {d3-selection} $parent - A d3-selection to a HTMLElement that this component should render itself into
   */
  render($parent = this.$parent) {
    if (!this.isSupported()) return;

// parent not actually used here , since we aren't rendering a button
//    if ($parent instanceof selection) {
//      this.$parent = $parent;
//    } else {
//      return;   // no parent - called too early?
//    }

    const context = this.context;

    // There was a button for this a long time ago
    // this.$button = $parent.append('button')
    //   .attr('title', t('full_screen'))
    //   .on('click', fullScreen)
    //   .call(tooltip);
    // this.$button.append('span')
    //   .attr('class', 'icon full-screen');

    const detected = utilDetect();
    const keys = (detected.os === 'mac' ? [utilCmd('⌃⌘F'), 'f11'] : ['f11']);
    context.keybinding().off(keys);
    context.keybinding().on(keys, this.toggle);
  }


  /**
   * isSupported
   * @return {boolean}  `true` if the container can be made fullscreen, `false` if not
   */
  isSupported() {
    const container = this.context.containerNode;
    return (typeof container.requestFullscreen === 'function');
  }


  /**
   * isFullscreen
   * @return {boolean}  `true` if the container is currently fullscreen, `false` if not
   */
  isFullscreen() {
    const container = this.context.containerNode;
    return document.fullscreenElement === container;
  }


  /**
   * requestFullscreen
   * @return {Promise}  Promise settled when the browser has entered fullscreen mode
   */
  requestFullscreen() {
    const container = this.context.containerNode;
    return container.requestFullscreen();
    // $button.classed('active', true);
  }


  /**
   * exitFullscreen
   * @return {Promise}  Promise settled when the browser has left fullscreen mode
   */
  exitFullscreen() {
    return document.exitFullscreen();
    // $button.classed('active', false);
  }


  /**
   * Toggle fullscreen mode
   * @param  {Event}    e? - the triggering event, if any (keypress or click)
   * @return {Promise}  Promise settled when the browser is finished toggling
   */
  toggle(e) {
    if (e)  e.preventDefault();
    if (!this.isSupported()) return Promise.resolve();  // do nothing

    if (!this.isFullscreen()) {
      return this.requestFullscreen();
    } else {
      return this.exitFullscreen();
    }
  }

}
