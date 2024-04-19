import { EventEmitter } from '@pixi/utils';
import { vecRotate } from '@rapid-sdk/math';

import { utilDetect } from '../util/detect.js';


/**
 * PixiEvents does the work of managing the events that other parts of the code are interested in.
 * We bind them once here and dispatch them so that other code can do less work.
 *
 * Properties available:
 *   `enabled`              `true` if the event handlers are enabled, `false` if not.
 *   `coord`                `[x,y]` coordinates of the latest event (provided in "screen" and "map")
 *   `pointerOverRenderer`  `true` if the pointer is over the renderer, `false` if not
 *   `modifierKeys`         Set containing the modifier keys that are currently down ('Alt', 'Control', 'Meta', 'Shift')
 *
 * Events available:
 *   `click`             Fires on stage.click, receives a Pixi FederatedPointerEvent
 *   `keydown`           Fires on window.keydown, receives a DOM KeyboardEvent
 *   `keyup`             Fires on window.keyup, receives a DOM KeyboardEvent
 *   `modifierchange`    Fires when any modifier key is changed, receives the updated modifierKeys Set
 *   `pointercancel`     Fires on stage.pointercancel, receives a Pixi FederatedPointerEvent
 *   `pointerdown`       Fires on stage.pointerdown, receives a Pixi FederatedPointerEvent
 *   `pointermove`       Fires on stage.pointermove, receives a Pixi FederatedPointerEvent
 *   `pointerout`        Fires on canvas.pointerout, receives a DOM PointerEvent
 *   `pointerover`       Fires on canvas.pointerover, receives a DOM PointerEvent
 *   `pointerup`         Fires on stage.pointerup, receives a Pixi FederatedPointerEvent
 *   `wheel`             Fires on supersurface.wheel, receives a DOM WheelEvent + some properties containing normalized wheel delta values
 */
export class PixiEvents extends EventEmitter {

  /**
   * @constructor
   * @param  renderer   The Renderer that owns this Event system
   */
  constructor(renderer) {
    super();
    this._enabled = false;

    this.renderer = renderer;
    this.context = renderer.context;

    this.pointerOverRenderer = false;
    this.modifierKeys = new Set();
    this.coord = {
      screen: [0,0],  // [0,0] is top,left of the screen
      map: [0,0]      // [0,0] is the origin of the viewport (rotation removed)
    };

    this._wheelDefault = utilDetect().os === 'mac' ? 'auto' : 'zoom';

    // Make sure the event handlers have `this` bound correctly
    this._click = this._click.bind(this);
    this._keydown = this._keydown.bind(this);
    this._keyup = this._keyup.bind(this);
    this._pointercancel = this._pointercancel.bind(this);
    this._pointerdown = this._pointerdown.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._pointerout = this._pointerout.bind(this);
    this._pointerover = this._pointerover.bind(this);
    this._pointerup = this._pointerup.bind(this);
    this._wheel = this._wheel.bind(this);

    this.enable();
  }


  /**
   * enabled
   * Whether the events are enabled
   * @readonly
   */
  get enabled() {
    return this._enabled;
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;
    this._enabled = true;

    this.modifierKeys.clear();

    window.addEventListener('keydown', this._keydown);
    window.addEventListener('keyup', this._keyup);

    const renderer = this.renderer;

    // Attach wheel to supersurface so that content on the overlay (like the edit menu)
    // doesn't receive the wheel events and prevent panning and zooming.
    const supersurface = renderer.supersurface.node();
    supersurface.addEventListener('wheel', this._wheel, { passive: false });  // false allows preventDefault

    const view = renderer.pixi.view;
    view.addEventListener('pointerover', this._pointerover);
    view.addEventListener('pointerout', this._pointerout);

    const stage = renderer.pixi.stage;
    stage.addEventListener('click', this._click);
    stage.addEventListener('rightclick', this._click);   // pixi has a special 'rightclick' event
    stage.addEventListener('pointerdown', this._pointerdown);
    stage.addEventListener('pointermove', this._pointermove);
    stage.addEventListener('pointerup', this._pointerup);
    stage.addEventListener('pointerupoutside', this._pointercancel);  // if up outide, just cancel
    stage.addEventListener('pointercancel', this._pointercancel);
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    this.modifierKeys.clear();

    window.removeEventListener('keydown', this._keydown);
    window.removeEventListener('keyup', this._keyup);

    const renderer = this.renderer;

    const supersurface = renderer.supersurface.node();
    supersurface.removeEventListener('wheel', this._wheel);

    const view = renderer.pixi.view;
    view.removeEventListener('pointerover', this._pointerover);
    view.removeEventListener('pointerout', this._pointerout);

    const stage = renderer.pixi.stage;
    stage.removeEventListener('click', this._click);
    stage.removeEventListener('rightclick', this._click);
    stage.removeEventListener('pointerdown', this._pointerdown);
    stage.removeEventListener('pointermove', this._pointermove);
    stage.removeEventListener('pointerup', this._pointerup);
    stage.removeEventListener('pointerupoutside', this._pointercancel);
    stage.removeEventListener('pointercancel', this._pointercancel);
  }


  /**
   * setCursor
   * Sets the cursor to the given style.
   * Pixi EventSystem uses the CSS cursor styles, but also allows for custom cursors in the EventSystem
   * see: https://pixijs.download/release/docs/PIXI.EventSystem.html#setCursor
   * @param  `style` String for one of the given CSS cursor styles (pass 'inherit' to reset)
   */
  setCursor(style) {
    // Pixi doesn't make this easy
    // On next pointerover event, the root event boundary will reset its perferred cursor
    // to whatever the .cursor property of the target is. (see EventBoundary.ts line 703)
    // We don't know when that event will be, next time user happens to shake the mouse?
    // So we'll also set it directly on the canvas so it locks in now
    const path = this.context.assetPath;
    const view = this.renderer.pixi.view;

    const cursors = {
      areaCursor: `url(${path}img/cursor-select-area.png), pointer`,
      connectLineCursor: `url(${path}img/cursor-draw-connect-line.png) 9 9, crosshair`,
      connectVertexCursor: `url(${path}img/cursor-draw-connect-vertex.png) 9 9, crosshair`,
      lineCursor: `url(${path}img/cursor-select-line.png), pointer`,
      pointCursor: `url(${path}img/cursor-select-point.png), pointer`,
      selectSplitCursor: `url(${path}img/cursor-select-split.png), pointer`,
      vertexCursor: `url(${path}img/cursor-select-vertex.png), pointer`,
    };

    switch (style) {
      case 'areaCursor':
        view.style.cursor = cursors.areaCursor;
        break;
      case 'connectLineCursor':
        view.style.cursor = cursors.connectLineCursor;
        break;
      case 'connectVertexCursor':
        view.style.cursor = cursors.connectVertexCursor;
        break;
      case 'lineCursor':
        view.style.cursor = cursors.lineCursor;
        break;
      case 'pointCursor':
        view.style.cursor = cursors.pointCursor;
        break;
      case 'selectSplitCursor':
        view.style.cursor = cursors.selectSplitCursor;
        break;
      case 'vertexCursor':
        view.style.cursor = cursors.vertexCursor;
        break;
      default:
        view.style.cursor = style;
        break;
      }
  }


  /**
   * _observeModifierKeys
   * For pointer and keyboard events that contain properties about the modifier keys,
   *   this code checks those properties and updates the `modifierKeys` set.
   * It's possible to miss a modifier key if it changed when the window was out of focus
   *   but we will know its state once the pointer events occur on the canvas again.
   *
   * @param  `e`  A Pixi FederatedPointerEvent or DOM KeyboardEvent
   */
  _observeModifierKeys(e) {
    const modifiers = this.modifierKeys;
    const toCheck = [
      'Alt',      // ALT key, on Mac: ⌥ (option)
      'Control',  // CTRL key, on Mac: ⌃ (control)
      'Meta',     // META, on Mac: ⌘ (command), on Windows (Win), on Linux (Super)
      'Shift'     // Shift key, ⇧
    ];

    let didChange = false;
    for (const key of toCheck) {
      const keyIsDown = e.getModifierState(key);
      const keyWasDown = modifiers.has(key);

      if (keyIsDown && !keyWasDown) {
        modifiers.add(key);
        didChange = true;
      } else if (!keyIsDown && keyWasDown) {
        modifiers.delete(key);
        didChange = true;
      }
    }

    if (didChange) {
      this.emit('modifierchange', modifiers);
    }
  }


  /**
   * _observeCoordinate
   * Gather the coordinate data
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _observeCoordinate(x, y) {
    this.coord = {
      screen: [x, y],  // [0,0] is top,left of the screen
      map: [x, y]      // [0,0] is the origin of the viewport (rotation removed)
    };

    const viewport = this.context.viewport;
    const r = viewport.transform.r;
    if (r) {
      this.coord.map = vecRotate(this.coord.screen, -r, viewport.center());  // remove rotation
    }
  }


  /**
   * _checkButtons
   * On Mac, consider a control-left-click as a right-click - Rapid#920
   * https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
   * https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/buttons
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _checkButtons(e) {
    if (e.ctrlKey && utilDetect().os === 'mac') {
      if (e.button === 0) {   // left button
        e.button = 2;         // right button
      }
      if ((e.buttons & 0b11) === 0b01) {  // left and not right
        e.buttons ^= 0b11;                // swap left and right
      }
    }
  }


  /**
   * _keydown
   * Handler for keydown events on the window.
   * @param  `e`  A DOM KeyboardEvent
   */
  _keydown(e) {
    this._observeModifierKeys(e);
    this.emit('keydown', e);
  }

  /**
   * _keyup
   * Handler for keyup events on the window.
   * @param  `e`  A DOM KeyboardEvent
   */
  _keyup(e) {
    this._observeModifierKeys(e);
    this.emit('keyup', e);
  }

  /**
   * _pointerover
   * Handler for pointerover events on the canvas.
   * @param  `e`  A DOM PointerEvent
   */
  _pointerover(e) {
    this._observeModifierKeys(e);
    // Don't call `_checkButtons(e)` here.
    // The DOM PointerEvent button properties are readonly.
    // and we don't really need to remap control-left-click to right-click in this situation.
    this.pointerOverRenderer = true;
    this.emit('pointerover', e);
  }

  /**
   * _pointerout
   * Handler for pointerout events on the canvas.
   * @param  `e`  A DOM PointerEvent
   */
  _pointerout(e) {
    this._observeModifierKeys(e);
    // Don't call `_checkButtons(e)` here.
    // The DOM PointerEvent button properties are readonly.
    // and we don't really need to remap control-left-click to right-click in this situation.
    this.pointerOverRenderer = false;
    this.emit('pointerout', e);
  }

  /**
   * _pointerdown
   * Handler for pointerdown events on the stage.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerdown(e) {
    this._observeModifierKeys(e);
    this._observeCoordinate(e.global.x, e.global.y);
    this._checkButtons(e);
    this.emit('pointerdown', e);
  }

  /**
   * _pointermove
   * Handler for pointermove events on the stage.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove(e) {
    this._observeModifierKeys(e);
    this._observeCoordinate(e.global.x, e.global.y);
    this._checkButtons(e);
    this.emit('pointermove', e);
  }

  /**
   * _pointerup
   * Handler for pointerup events on the stage.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerup(e) {
    this._observeModifierKeys(e);
    this._observeCoordinate(e.global.x, e.global.y);
    this._checkButtons(e);
    this.emit('pointerup', e);
  }

  /**
   * _pointercancel
   * Handler for pointercancel events on the stage.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointercancel(e) {
    this.emit('pointercancel', e);
  }

  /**
   * _click
   * Handler for click events on the stage.
   * @param  `e`  A DOM PointerEvent
   */
  _click(e) {
    // no need to _observeModifierKeys here, 'click' fires immediately after 'pointerup'
    this._checkButtons(e);
    this.emit('click', e);
  }


  /**
   * _wheel
   * Handler for wheel events on the supersurface.
   * @param  `e`  A DOM WheelEvent
   */
  _wheel(e) {
    e.preventDefault();             // don't scroll supersurface contents
    e.stopImmediatePropagation();   // don't scroll page contents either

    const context = this.context;
    const storage = context.systems.storage;

    this._observeCoordinate(e.offsetX, e.offsetY);
    let [dX, dY] = this._normalizeWheelDelta(e);

    // There is some code in here to try to detect when the user is 2-finger scrolling
    // on a trackpad, and if so allow this gesture to 'pan' the map instead of zooming it.

    // Round numbers
    //   - 2-finger pans on a trackpad
    //   - mouse wheels (occasionally)
    // Fractional numbers
    //   - 2-finger pinch-zooms on a trackpad (`e.ctrlKey` will be true in this case)
    //   - mouse wheels (usually)
    const isRoundNumber = (typeof dY === 'number' && isFinite(dY) && Math.floor(dY) === dY);

    // On a multitouch trackpad, this 'wheel' event came from a pinch/unpinch gesture IF:
    // - dY is a fractional number, AND
    // - e.ctrlKey is `true`
    // see https://kenneth.io/post/detecting-multi-touch-trackpad-gestures-in-javascript
    // (NB: We observe modifier keys elsewhere and can know whether the user really did press ctrlKey)
    const isPinchZoom = !isRoundNumber && e.ctrlKey && !this.modifierKeys.has('Control');

    let gesture = 'zoom';  // Detect this wheel event as 'zoom' or 'pan'
    let speed = 3;         // Multiplier to adjust the zoom speed

    if (isPinchZoom) {   // A pinch-zoom gesture on a trackpad...
      gesture = 'zoom';
      speed = 6;

    } else if (e.shiftKey) {   // If shift is down, always zoom...
      gesture = 'zoom';
      speed = 3;

    } else {  // consider user mouse_wheel preference
      const wheelPref = storage.getItem('prefs.mouse_wheel.interaction') ?? this._wheelDefault;

      // User wants to 'pan' by default OR
      // We autodetect - either horizontal scroll present or vertical scroll is a round number...
      if (
        (wheelPref === 'pan') ||
        (wheelPref === 'auto' && (dX || isRoundNumber))
      ) {
        gesture = 'pan';
        speed = 1;
      } else {
        gesture = 'zoom';
        speed = 3;
      }
    }

    // Decorate the wheel event with whatever we detected.
    e._gesture = gesture;
    e._normalizedDeltaX = dX * speed;
    e._normalizedDeltaY = dY * speed;
    e._coord = this.coord;

    this.emit('wheel', e);
  }


  /**
   * _normalizeWheelDelta
   * This code performs some adjustment of the wheel event delta values.
   * The values may be given in PIXEL, LINES, or PAGE and we want them in PIXEL.
   *
   * Great summaries here:
   *   https://dev.to/danburzo/pinch-me-i-m-zooming-gestures-in-the-dom-a0e
   *   https://github.com/w3c/uievents/issues/181#issuecomment-392648065
   *
   * Note that Firefox will now change its behavior depending on how you look at the delta values!
   *   https://github.com/mdn/content/issues/11811
   *   https://bugzilla.mozilla.org/show_bug.cgi?id=1392460#c33
   * PixiJS reads deltaX/Y/Z before deltaMode in order to get consistent values from Firefox:
   *   https://github.com/pixijs/pixijs/pull/8972
   *   https://github.com/pixijs/pixijs/issues/8970
   *
   * Also see https://github.com/basilfx/normalize-wheel/blob/master/src/normalizeWheel.js
   *   for an older version of this sort of code.
   *
   * And this great page for testing what events your browser generates:
   *   https://domeventviewer.com/
   *
   * @param   `e`  A native DOM WheelEvent
   * @returns `Array` of normalized `[deltaX, deltaY]` in pixels
   */
  _normalizeWheelDelta(e) {
    let [dX, dY] = [e.deltaX, e.deltaY];  // raw delta values

    if (dY === 0 && e.shiftKey) {         // Some browsers treat skiftKey as horizontal scroll
      [dX, dY] = [e.deltaY, e.deltaX];    // swap dx/dy values to undo it.
    }

    let [sX, sY] = [Math.sign(dX), Math.sign(dY)];    // signs
    let [mX, mY] = [Math.abs(dX), Math.abs(dY)];      // magnitudes

    // Fractional numbers are generated from wheel events on many mouse types, but notably by
    // 2-finger pinch/unpinch gestues on a trackpad. Because we want to handle these specially,
    // we'll try to keep the round numbers round and the fractional numbers fractional.
    const isRoundX = (typeof mY === 'number' && isFinite(mX) && Math.floor(mX) === mX);
    const isRoundY = (typeof mY === 'number' && isFinite(mY) && Math.floor(mY) === mY);
    const fuzzX = isRoundX ? 0 : 0.001;
    const fuzzY = isRoundY ? 0 : 0.001;

    // If the wheel delta values are not given in pixels, convert to pixels.
    // (These days only Firefox will _sometimes_ report wheel delta in LINE units).
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1392460#c33
    if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
      let pixels;
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        pixels = 8;
      } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        pixels = 24;
      } else {     /* unknown units? */
        pixels = 1;
      }

      mX *= pixels;
      mY *= pixels;
    }

    // Limit the returned values to prevent user from scrolling too fast.
    // Add fuzz if needed to keep round numbers round and fractional numbers fractional.
    const MAX = 40;
    const pX = sX * (Math.min(MAX, mX) + fuzzX);
    const pY = sY * (Math.min(MAX, mY) + fuzzY);

    // console.log(`deltaMode = ${e.deltaMode}, inX = ${e.deltaX}, inY = ${e.deltaY}, outX = ${pX}, outY = ${pY}`);
    return [pX, pY];
  }
}

