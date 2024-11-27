import * as PIXI from 'pixi.js';
import { selection } from 'd3-selection';


/**
 * UiSpector
 * Spector.js is a WebGL debugging tool
 * This is just a wrapper for the Spector.js debugger
 * Is is only available on the development build of Rapid.
 */
export class UiSpector {

  /**
   * @constructor
   * @param  `conttext`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this._isHidden = true;   // start out hidden

    // Child components, we will defer creating these until `_initSpectorUI()`
    this.Spector = null;
    this.CaptureMenu = null;
    this.ResultView = null;

    // D3 selections
    this.$parent = null;
    this.$wrap = null;

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
    if ($parent instanceof selection) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    // add .spector wrapper
    let $wrap = $parent.selectAll('.spector')
      .data([0]);

    const $$wrap = $wrap.enter()
      .append('div')
      .attr('class', 'spector');

    this.$wrap = $wrap = $wrap.merge($$wrap)
      .style('display', this._isHidden ? 'none' : 'block');
  }


  /**
   * toggle
   * Toggles the Spector UI on/off
   * @param  {Event} e? - triggering event (if any)
   */
  toggle(e) {
    if (e) e.preventDefault();
    this._initSpectorUI();

    const $wrap = this.$wrap;
    const CaptureMenu = this.CaptureMenu;
    if (!$wrap || !CaptureMenu) return;   // called too early / couldn't init spector?

    if (this._isHidden) {
      this._isHidden = false;
      CaptureMenu.display();

      // Hide fps meter (it is inaccurate?)
      $wrap.selectAll('.fpsCounterComponent')
        .style('display', 'none');

      $wrap
        .style('display', 'block')
        .style('opacity', '0')
        .transition()
        .duration(200)
        .style('opacity', '1');

    } else {
      this._isHidden = true;
      $wrap
        .transition()
        .duration(200)
        .style('opacity', '0')
        .on('end', () => {
          $wrap.style('display', 'none');
          CaptureMenu.hide();
        });
    }
  }


  /**
   * _initSpectorUI
   * This creates the Spector components and starts spying on the rendering canvas.
   * (We avoid doing this until something calls `toggle()` to try to show the UI)
   */
  _initSpectorUI() {
    if (!this.$wrap) return;      // called too early?
    if (this.Spector) return;     // already done
    if (!window.SPECTOR) return;  // no spector - production build?

    const context = this.context;
    const gfx = context.systems.gfx;
    const renderer = gfx.pixi.renderer;

    // Spector will only work with the WebGL renderer
    if (renderer.type !== PIXI.RendererType.WEBGL) return;  // webgpu?
    const spector = new window.SPECTOR.Spector();
    this.Spector = spector;

    // The default behavior of the CaptureMenu is to search the document for canvases to spy.
    // This doesn't work in our situation because Pixi is setup with `multiView: true`
    // and will render to an offscreen canvas - instead we will tell it what canvas to spy on.
    const canvas = renderer.context.canvas;
    spector.spyCanvas(canvas);

    // override of spector.getCaptureUI()
    const options = {
      rootPlaceHolder: this.$wrap.node(),
      canvas: canvas,
      hideLog: true
    };

    const cm = new window.SPECTOR.EmbeddedFrontend.CaptureMenu(options);
    cm.trackPageCanvases = () => {};    // replace with no-op to avoid doing this
    cm.updateCanvasesList([canvas]);    // only the one we are spying

    cm.onPauseRequested.add(spector.pause, spector);
    cm.onPlayRequested.add(spector.play, spector);
    cm.onPlayNextFrameRequested.add(spector.playNextFrame, spector);
    cm.onCaptureRequested.add(info => {
      if (info) {
        spector.captureCanvas(info.ref);
      }
    }, spector);

// hide fps meter (it is inaccurate?)
//      window.setInterval(() => {
//        if (this._isHidden) return;
//        cm.setFPS(spector.getFps());
//      }, 1000);

    this.CaptureMenu = spector.captureMenu = cm;

    // override of spector.getResultUI()
    const rv = new window.SPECTOR.EmbeddedFrontend.ResultView();

    spector.onCapture.add(capture => {
      rv.display();
      rv.addCapture(capture);
    });

    this.ResultView = spector.resultView = rv;
  }

}
