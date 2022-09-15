import { select as d3_select } from 'd3-selection';
import { vecEqual, vecLength } from '@id-sdk/math';

import { AbstractBehavior } from './AbstractBehavior';
import { modeSelect } from '../modes/select';
import { osmEntity, osmNote, QAItem } from '../osm';
import { services } from '../services';
import { utilKeybinding } from '../util';

const NEAR_TOLERANCE = 4;
const FAR_TOLERANCE = 12;
const DEBUG = false;


/**
 * `BehaviorSelect` listens to pointer events and selects items that are clicked on.
 *
 * Properties available:
 *   `enabled`      `true` if the event handlers are enabled, `false` if not.
 *   `lastDown`     `eventData` Object for the most recent down event
 *   `lastMove`     `eventData` Object for the most recent move event
 *   `lastSpace`    `eventData` Object for the most recent move event used to trigger a spacebar click
 *   `lastClick`    `eventData` Object for the most recent click event
 */
export class BehaviorSelect extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'select';

    this._multiSelection = new Set();
    this._spaceClickDisabled = false;
    this._longPressTimeout = null;
    this._showMenu = false;

    this.lastDown = null;
    this.lastMove = null;
    this.lastSpace = null;
    this.lastClick = null;

    this._keybinding = utilKeybinding('selectbehavior');

    // Make sure the event handlers have `this` bound correctly
    this._pointerdown = this._pointerdown.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._pointerup = this._pointerup.bind(this);
    this._pointercancel = this._pointercancel.bind(this);

    this._keydown = this._keydown.bind(this);
    this._keyup = this._keyup.bind(this);
    this._spacebar = this._spacebar.bind(this);
    this._showContextMenu = this._showContextMenu.bind(this);
    this._didLongPress = this._didLongPress.bind(this);

    this._multiSelect = false;
    d3_select(window)
      .on('keydown.BehaviorSelect', this._keydown)
      .on('keyup.BehaviorSelect', this._keyup);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;
    if (!this.context.pixi) return;

    if (DEBUG) {
      console.log('BehaviorSelect: enabling listeners'); // eslint-disable-line no-console
    }

    this._enabled = true;
    this.lastDown = null;
    this.lastMove = null;
    this.lastSpace = null;
    this.lastClick = null;
    this._multiSelection.clear();

    this._keybinding
      .on('shift', this._keyup)
      .on('space', this._spacebar)
      .on('⌥space', this._spacebar);

    const stage = this.context.pixi.stage;
    stage.addEventListener('pointerdown', this._pointerdown);
    stage.addEventListener('pointermove', this._pointermove);
    stage.addEventListener('pointerup', this._pointerup);
    stage.addEventListener('pointerupoutside', this._pointercancel);  // if up outide, just cancel
    stage.addEventListener('pointercancel', this._pointercancel);

    d3_select(document)
      .call(this._keybinding);
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;
    if (!this.context.pixi) return;

    if (DEBUG) {
      console.log('BehaviorSelect: disabling listeners'); // eslint-disable-line no-console
    }

    this._enabled = false;
    this.lastDown = null;
    this.lastMove = null;
    this.lastSpace = null;
    this.lastClick = null;
    this._multiSelection.clear();
    this.cancelLongPress();

    const stage = this.context.pixi.stage;
    stage.removeEventListener('pointerdown', this._pointerdown);
    stage.removeEventListener('pointermove', this._pointermove);
    stage.removeEventListener('pointerup', this._pointerup);
    stage.removeEventListener('pointerupoutside', this._pointercancel);  // if up outide, just cancel
    stage.removeEventListener('pointercancel', this._pointercancel);

    d3_select(document)
      .call(this._keybinding.unbind);
  }


  /**
   * _pointerdown
   * Handler for pointerdown events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerdown(e) {
    if (this.lastDown) return; // a pointer is already down

    this.cancelLongPress();

    if (DEBUG) {
      console.log('BehaviorSelect: pointerdown'); // eslint-disable-line no-console
    }

    // If pointer is not over the renderer, just discard
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
//    const interactionManager = this.context.pixi.renderer.plugins.interaction;
//    const pointerOverRenderer = interactionManager.mouseOverRenderer;
//    // However, do not discard if the event was a touch event.
//    if (!pointerOverRenderer && e.data.pointerType !== 'touch') return;

    const down = this._getEventData(e);

    // For touch devices, we want to make sure that the context menu is accessible via long press.
    if (e.data.pointerType === 'touch') {
      this._longPressTimeout = window.setTimeout(this._didLongPress, 750, down);
    }

    this.lastDown = down;
    this.lastClick = null;
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove(e) {
    const move = this._getEventData(e);

    // We get a lot more move events than we need, so discard ones where it hasn't actually moved much
    if (this.lastMove && vecEqual(move.coord, this.lastMove.coord, 0.9)) return;

    this.lastMove = move;

    // If the pointer moves too much, we consider it as a drag, not a click, and set `isCancelled=true`
    const down = this.lastDown;
    if (down && !down.isCancelled && down.id === move.id) {
      const dist = vecLength(down.coord, move.coord);
      if (dist >= NEAR_TOLERANCE) {
        down.isCancelled = true;
      }
    }
  }


  /**
   * _pointerup
   * Handler for pointerup events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerup(e) {
    const down = this.lastDown;
    const up = this._getEventData(e);
    if (!down || down.id !== up.id) return;  // not down, or different pointer

    this.lastDown = null;  // prepare for the next `pointerdown`

    if (down.isCancelled) return; // was cancelled already by moving too much

    if (DEBUG) {
      console.log('BehaviorSelect: pointerup'); // eslint-disable-line no-console
    }

    const dist = vecLength(down.coord, up.coord);
    if (dist < NEAR_TOLERANCE || (dist < FAR_TOLERANCE && up.time - down.time < 500)) {
      this.lastClick = up;   // We will accept this as a click

      // If we're clicking on something, we want to disable dbl click to zoom.
      if (up.data) {
        // Prevent a quick second click
        this.context.map().dblclickZoomEnable(false);

        d3_select(window).on(
          'click.draw-block',
          (e) => e.stopPropagation(),
          true
        );

        window.setTimeout(() => {
          this.context.map().dblclickZoomEnable(true);
          d3_select(window).on('click.draw-block', null);
        }, 500);
      }

      this._processClick();

      if (down.originalEvent.button === 2) {   // right click
        this._showContextMenu(up);
      }
    }
  }


  /**
   * _pointercancel
   * Handler for pointercancel events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointercancel() {
    // Here we can throw away the down data to prepare for another `pointerdown`.
    // After pointercancel, there should be no more `pointermove` or `pointerup` events.
    this.lastDown = null;
  }


  /**
   * _keydown
   * Handler for keydown events.
   * @param  `e`  A d3 keydown event
   */
  _keydown(e) {
    // if any key is pressed the user is probably doing something other than long-pressing
    this.cancelLongPress();

    if (e.keyCode === 32) {  // spacebar
      // ignore spacebar events during text input
      const activeNode = document.activeElement;
      if (activeNode && new Set(['INPUT', 'TEXTAREA']).has(activeNode.nodeName)) return;
      this._spacebar(e);
      return;

    } else if (e.keyCode === 93) {  // contextmenu key
      // For contextmenu key events, we will instead use the last move event
      if (!this.lastMove) return;
      const move = Object.assign({}, this.lastMove);  // shallow copy
      this._showContextMenu(move);
      return;
    }

    if (e.shiftKey) {
      this._multiSelect = true;
      return;
    }
  }


  /**
   * _keyup
   * Handler for releases of the modifier keys
   * @param  `e`  A d3 keyup event
   */
  _keyup(e) {
    if (e.key === 'Shift') {
      this._multiSelect = false;
     }
 }

  /**
   * _spacebar
   * Handler for `keydown` events of the spacebar. We use these to simulate clicks.
   * Note that the spacebar will repeat, so we can get many of these.
   * @param  `e`  A d3 keydown event
   */
  _spacebar(e) {
    e.preventDefault();
    e.stopPropagation();

    // Ignore it if we are not over the canvas
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
//    const interactionManager = this.context.pixi.renderer.plugins.interaction;
//    const pointerOverRenderer = interactionManager.mouseOverRenderer;
//    if (!pointerOverRenderer) return;

    // For spacebar clicks we will instead use the last move event
    if (!this.lastMove) return;
    const move = Object.assign({}, this.lastMove);  // shallow copy

    // Because spacebar events will repeat if you keep it held down,
    // user must move pointer or lift spacebar to allow another spacebar click
    if (this._spaceClickDisabled && this.lastSpace) {
      const dist = vecLength(move.coord, this.lastSpace.coord);
      if (dist > FAR_TOLERANCE) {  // pointer moved far enough
        this._spaceClickDisabled = false;
      }
    }

    if (!this._spaceClickDisabled) {
      this._spaceClickDisabled = true;
      this.lastSpace = move;
      this.lastClick = move;   // We will accept this as a click

      d3_select(window).on('keyup.space-block', e => {  // user lifted spacebar up
        if (e.code !== 'Space') return; // only spacebar
        e.preventDefault();
        e.stopPropagation();
        this._spaceClickDisabled = false;
        d3_select(window).on('keyup.space-block', null);
      });

      // simulate a click
      this._processClick();
    }
  }


  /**
   * _processClick
   * Once we have determined that the user has clicked, this is where we handle that click.
   * Note this is not a true `click` event handler.
   * We get into here from `_pointerup` or `_spacebar`.
   */
  _processClick() {
    if (!this._enabled || !this.lastClick) return;  // nothing to do

    const click = this.lastClick;
    const context = this.context;
    let datum = click.data;

    this.cancelLongPress();

    // Decide what we clicked on and switch modes

    // Clicked a midpoint..
    // Treat a click on a midpoint as if clicking on its parent way
    if (datum && datum.type === 'midpoint') {
      datum = datum.way;
    }

    // Clicked on nothing
    if (!datum) {
      const mode = context.mode();
      if (mode.id !== 'browse' && !this._multiSelection.size) {
        context.enter('browse');
      }
      return;
    }

    // Clicked a non-OSM feature..
    if (
      datum.__fbid__ || // Clicked a RapiD feature..
      datum.__featurehash__ || // Clicked Custom Data (e.g. gpx track)
      datum instanceof osmNote || // Clicked an OSM Note...
      datum instanceof QAItem // Clicked a QA Item (keepright, osmose, improveosm)...
    ) {
      const selection = new Map().set(datum.id, datum);
      context.enter('select', { selection: selection });
      return;
    }

    // Clicked an OSM feature..
    if (datum instanceof osmEntity) {
      var selectedIDs = context.selectedIDs();

      if (!this._multiSelect) {
        if (
          !this._showMenu ||
          selectedIDs.length <= 1 ||
          selectedIDs.indexOf(datum.id) === -1
        ) {

          // always enter modeSelect even if the entity is already
          // selected since listeners may expect `context.enter` events,
          // e.g. in the walkthrough

          context.enter(modeSelect(context, [datum.id]));
        }

      } else {
         if (selectedIDs.indexOf(datum.id) !== -1) {
           // clicked entity is already in the selectedIDs list..
           if (!this._showMenu) {
             // deselect clicked entity, then reenter select mode or return to browse mode..
             selectedIDs = selectedIDs.filter(function (id) {
               return id !== datum.id;
             });

             context.enter(modeSelect(context, selectedIDs));
           }
         } else {
           // clicked entity is not in the selected list, add it..
           selectedIDs = selectedIDs.concat([datum.id]);
           context.enter(modeSelect(context, selectedIDs));

         }
      }

    }

    // Clicked on a photo, so open / refresh the viewer's pic
    if (datum.captured_at) {
      // Determine the layer that was clicked on, obtain its service.
      const target = click.target;
      const photoLayerName = target.parent.name;
      const service = services[photoLayerName];
      if (!service) return;

      // The 'ID' of the photo varies by layer. Streetside uses 'key', others use 'id'.
      const photoID = photoLayerName === 'mapillary' ? datum.id : datum.key;

      service
        .ensureViewerLoaded(context)
        .then(() => service.selectImage(context, photoID).showViewer(context));

      context.map().centerEase(datum.loc);

      // No mode change event here, just manually tell the renderer to select it, for now
      const renderer = context.map().renderer();
      const ids = datum ? [target.name] : [];
      renderer.scene.selectFeatures(ids);
    }
  }


  /**
   * cancelLongPress
   */
  cancelLongPress() {
    if (this._longPressTimeout) {
      window.clearTimeout(this._longPressTimeout);
      this._longPressTimeout = null;
      this._showMenu = false;
    }
  }


  /**
   * _didLongPress
   * Called a short time after pointerdown.  If we're still down, show the contextmenu.
   */
  _didLongPress(down) {
    this._longPressTimeout = null;
    if (this.lastDown === down && !down.isCancelled) {   // still down
      this._showContextMenu(down);
    }
  }


  /**
   * _showContextMenu
   * Once we have determined that the user wants the contextmenu, this is where we handle that.
   * Note this is not a true `contextmenu` event handler
   * We get into here from `_pointerup`, `_keydown`, or `_didLongPress`
   */
  _showContextMenu(eventData) {
    const datum = eventData.data;
    this._showMenu = true;

    // Only attempt to display the context menu if we're focused on a non-RapiD OSM Entity.
    if (datum && datum instanceof osmEntity && !datum.__fbid__) {
      this.context.ui().showEditMenu(eventData.coord);
    }
  }

}

