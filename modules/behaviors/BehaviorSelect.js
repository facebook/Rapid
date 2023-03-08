import { vecLength } from '@id-sdk/math';

import { AbstractBehavior } from './AbstractBehavior';
import { modeSelect } from '../modes/select';
import { osmEntity, osmNote, QAItem } from '../osm';
import { services } from '../services';
import { actionAddMidpoint } from '../actions/add_midpoint';
import { osmNode } from '../osm/node';
import { osmWay } from '../osm/way';
import { t } from '../core/localizer';
import { geoChooseEdge } from '../geo';

const NEAR_TOLERANCE = 4;
const FAR_TOLERANCE = 12;


/**
 * `BehaviorSelect` listens to pointer events and selects items that are clicked on.
 *
 * Properties available:
 *   `enabled`      `true` if the event handlers are enabled, `false` if not.
 *   `lastDown`     `eventData` Object for the most recent down event
 *   `lastUp`     `eventData` Object for the most recent up event (to detect dbl clicks)
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
    this._showsMenu = false;

    this.lastDown = null;
    this.lastUp = null;
    this.lastMove = null;
    this.lastSpace = null;
    this.lastClick = null;

    // Make sure the event handlers have `this` bound correctly
    this._cancelLongPress = this._cancelLongPress.bind(this);
    this._doLongPress = this._doLongPress.bind(this);
    this._keydown = this._keydown.bind(this);
    this._keyup = this._keyup.bind(this);
    this._pointercancel = this._pointercancel.bind(this);
    this._pointerdown = this._pointerdown.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._pointerup = this._pointerup.bind(this);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;

    this._enabled = true;
    this._multiSelection.clear();
    this._spaceClickDisabled = false;
    this._longPressTimeout = null;
    this._showsMenu = false;

    this.lastDown = null;
    this.lastUp = null;
    this.lastMove = null;
    this.lastSpace = null;
    this.lastClick = null;

    const eventManager = this.context.map().renderer.events;
    eventManager.on('keydown', this._keydown);
    eventManager.on('keyup', this._keyup);
    eventManager.on('pointerdown', this._pointerdown);
    eventManager.on('pointermove', this._pointermove);
    eventManager.on('pointerup', this._pointerup);
    eventManager.on('pointercancel', this._pointercancel);
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;

    this._enabled = false;
    this._multiSelection.clear();
    this._spaceClickDisabled = false;
    this._longPressTimeout = null;
    this._showsMenu = false;

    this.lastDown = null;
    this.lastUp = null;
    this.lastMove = null;
    this.lastSpace = null;
    this.lastClick = null;

    this._cancelLongPress();

    const eventManager = this.context.map().renderer.events;
    eventManager.off('keydown', this._keydown);
    eventManager.off('keyup', this._keyup);
    eventManager.off('pointerdown', this._pointerdown);
    eventManager.off('pointermove', this._pointermove);
    eventManager.off('pointerup', this._pointerup);
    eventManager.off('pointercancel', this._pointercancel);
  }


  /**
   * _keydown
   * Handler for keydown events on the window.
   * @param  `e`  A DOM KeyboardEvent
   */
  _keydown(e) {
    // if any key is pressed the user is probably doing something other than long-pressing
    this._cancelLongPress();

    if (e.key === 'ContextMenu') {
      e.preventDefault();
      this._doContextMenu();
      return;

    // After spacebar click, user must move pointer or lift spacebar to allow another spacebar click
    } else if (!this._spaceClickDisabled && [' ', 'Spacebar'].includes(e.key)) {
      // ignore spacebar events during text input
      const activeNode = document.activeElement;
      if (activeNode && new Set(['INPUT', 'TEXTAREA']).has(activeNode.nodeName)) return;
      e.preventDefault();
      e.stopPropagation();
      this._spacebar();
    }
  }


  /**
   * _keyup
   * Handler for keyup events on the window.
   * @param  `e`  A DOM KeyboardEvent
   */
  _keyup(e) {
    // After spacebar click, user must move pointer or lift spacebar to allow another spacebar click
    if (this._spaceClickDisabled && [' ', 'Spacebar'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      this._spaceClickDisabled = false;
    }
  }


  /**
   * _pointerdown
   * Handler for pointerdown events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerdown(e) {
    if (this.lastDown) return;  // a pointer is already down

    this.context.ui().closeEditMenu();
    this._showsMenu = false;

    const down = this._getEventData(e);
    this.lastDown = down;
    this.lastClick = null;

    this._cancelLongPress();

    // For touch devices, we want to make sure that the context menu is accessible via long press.
    if (e.pointerType === 'touch') {
      this._longPressTimeout = window.setTimeout(this._doLongPress, 750, down);
    }
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove(e) {
    const move = this._getEventData(e);
    this.lastMove = move;

    // After spacebar click, user must move pointer or lift spacebar to allow another spacebar click
    if (this._spaceClickDisabled && this.lastSpace) {
      const dist = vecLength(move.coord, this.lastSpace.coord);
      if (dist > FAR_TOLERANCE) {     // pointer moved far enough
        this._spaceClickDisabled = false;
      }
    }

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
   * Handler for pointerup events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerup(e) {
    const down = this.lastDown;
    const up = this._getEventData(e);
    if (!down || down.id !== up.id) return;  // not down, or different pointer

    this.lastDown = null;  // prepare for the next `pointerdown`

    if (down.isCancelled) return;   // was cancelled already by moving too much

    const dist = vecLength(down.coord, up.coord);
    const updist = vecLength(up.coord, this.lastUp ? this.lastUp.coord : 0);
    const lClick = up.event.button === 0;
    // Second left-click nearby, targeting the same target, within half a second of the last up event.
    // We got ourselves a double click!
    if ( lClick && this.lastUp?.target?.dataID && updist < NEAR_TOLERANCE && this.lastUp?.target?.dataID === up.target?.dataID && up.time - (this.lastUp ? this.lastUp.time : 0) < 500) {
      this.lastClick = this.lastUp = up;  // We will accept this as a click
      this._doDoubleClick();
    } else if (dist < NEAR_TOLERANCE || (dist < FAR_TOLERANCE && up.time - down.time < 500)) {
      this.lastClick = this.lastUp = up;  // We will accept this as a click

      if (down.originalEvent.button === 2) {   // right click
        //If we right click on something that's not already selected, go ahead and select the item being right clicked on.
        if (!this.context.selectedIDs().includes(down.target.dataID)) {
          this._doSelect();
        }
        //Then, show the context menu.
        this._doContextMenu();
      } else {
        this._doSelect();
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
   * _spacebar
   * Handler for `keydown` events of the spacebar. We use these to simulate clicks.
   * Note that the spacebar will repeat, so we can get many of these.
   */
  _spacebar() {
    if (this._spaceClickDisabled) return;

    // For spacebar clicks we will use the last move event as the trigger
    if (!this.lastMove) return;

    // Becase spacebar events will repeat if you keep it held down,
    // user must move pointer or lift spacebar to allow another spacebar click.
    // So we disable further spacebar clicks until one of those things happens.
    this._spaceClickDisabled = true;
    this.lastSpace = this.lastMove;
    this.lastClick = this.lastMove;   // We will accept this as a click
    this._doSelect();
  }


  /**
   * _doSelect
   * Once we have determined that the user has clicked, this is where we handle that click.
   */
  _doSelect() {
    if (!this._enabled || !this.lastClick) return;  // nothing to do

    this._cancelLongPress();

    const context = this.context;
    const eventManager = context.map().renderer.events;

    const modifiers = eventManager.modifierKeys;
    const disableSnap = modifiers.has('Alt') || modifiers.has('Control') || modifiers.has('Meta');
    const isMultiselect = modifiers.has('Shift');
    const eventData = Object.assign({}, this.lastClick);  // shallow copy

    // If a modifier key is down, discard the target to prevent snap/hover.
    if (disableSnap) {
      eventData.target = null;
    }

    // Determine what we clicked on and switch modes..
    const target = eventData.target;
    let datum = target && target.data;

    // If we're clicking on something, we want to pause doubleclick zooms
    if (datum) {
      const behavior = this.context.behaviors.get('map-interaction');
      behavior.doubleClickEnabled = false;
      window.setTimeout(() => behavior.doubleClickEnabled = true, 500);
    }

    // Clicked a midpoint..
    // Treat a click on a midpoint as if clicking on its parent way
    if (datum && datum.type === 'midpoint') {
      datum = datum.way;
    }

    // Clicked on nothing
    if (!datum) {
      context.photos().selectPhoto(null);

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
      let selectedIDs = context.selectedIDs();

      if (!isMultiselect) {
        if (
          !this._showsMenu ||
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
          if (!this._showsMenu) {
            // deselect clicked entity, then reenter select mode or return to browse mode..
            selectedIDs = selectedIDs.filter(id => id !== datum.id);
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
      const layerID = target.layer.id;
      const service = services[layerID];
      if (!service) return;

      context.map().centerEase(datum.loc);
      context.photos().selectPhoto(layerID, datum.id);
//
//      // No mode change event here, just manually tell the renderer to select it, for now
//      const scene = context.scene();
//      scene.clearClass('selected');
//      scene.classData(layerID, datum.id, 'selected');
    }
  }


  /**
   * _cancelLongPress
   */
  _cancelLongPress() {
    if (!this._longPressTimeout) return;

    window.clearTimeout(this._longPressTimeout);
    this._longPressTimeout = null;
    this._showsMenu = false;
  }


  /**
   * _doLongPress
   * Called a short time after pointerdown.
   * If we're still down, treat it as a click + contextmenu.
   * @param  `down`  EventData Object for the original down event
   */
  _doLongPress(down) {
    this._longPressTimeout = null;

    if (this.lastDown === down && !down.isCancelled) {   // still down
      this.lastClick = down;    // We will accept this as a click
      down.isCancelled = true;  // cancel it so that we don't get *another* click when the user lifts up
      this._doSelect();
      this._doContextMenu();
    }
  }

  /**
   * _doDoubleClick
   * Once we have had two 'ups' in a row we need to see if anything special needs to be done to the entity being clicked on.
   * If it's a way or an area, we need to add a node wherever they clicked:
   * - If it's on a bare part of the way
   * - If they double clicked right on a midpoint.
   */
  _doDoubleClick() {
    if (!this._enabled || !this.lastUp) return;

    const context = this.context;
    const coord = this.lastUp.coord;
    const data = this.lastUp.target?.data;

    const isOSMWay = data instanceof osmWay && !data.__fbid__;
    const isMidpoint = data.type === 'midpoint';

    if (isOSMWay) {
      const graph = context.graph();
      const projection = context.projection;
      const loc = projection.invert(coord);
      const choice = geoChooseEdge(graph.childNodes(data), coord, projection);
      const edge = [data.nodes[choice.index - 1], data.nodes[choice.index]];
      context.perform(
        actionAddMidpoint({ loc: loc, edge: edge }, osmNode()),
        t('operations.add.annotation.vertex')
      );
      context.validator().validate();

    } else if (isMidpoint) {
      const edge = [data.a.id, data.b.id];
      context.perform(
        actionAddMidpoint({ loc: data.loc, edge: edge }, osmNode()),
        t('operations.add.annotation.vertex')
      );
      context.validator().validate();
    }
  }

  /**
   * _doContextMenu
   * Once we have determined that the user wants the contextmenu, this is where we handle that.
   * We get into here from `_pointerup`, `_keydown`, or `_doLongPress`
   * Uses whatever is in `this.lastClick` as the target for the menu.
   */
  _doContextMenu() {
    if (!this._enabled || !this.lastClick) return;  // nothing to do

    const context = this.context;
    const eventManager = context.map().renderer.events;

    const modifiers = eventManager.modifierKeys;
    const disableSnap = modifiers.has('Alt') || modifiers.has('Control') || modifiers.has('Meta');
    const eventData = Object.assign({}, this.lastClick);  // shallow copy

    // If a modifier key is down, discard the target to prevent snap/hover.
    if (disableSnap) {
      eventData.target = null;
    }

    if (this._showsMenu) {   // menu is on, toggle it off
      context.ui().closeEditMenu();
      this._showsMenu = false;

    } else {                 // menu is off, toggle it on
      // Only attempt to display the context menu if we're focused on a non-RapiD OSM Entity.
        this._showsMenu = true;
        context.ui().showEditMenu(eventData.coord);
    }
  }

}
