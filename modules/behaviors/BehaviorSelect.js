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
    this._showMenu = false;
    // this._lastInteractionType = null;

    this.lastDown = null;
    this.lastMove = null;
    this.lastSpace = null;

    this._keybinding = utilKeybinding('selectbehavior');

    // Make sure the event handlers have `this` bound correctly
    this._pointerdown = this._pointerdown.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._pointerup = this._pointerup.bind(this);
    this._pointercancel = this._pointercancel.bind(this);

    this._keydown = this._keydown.bind(this);
    this._spacebar = this._spacebar.bind(this);
  }

  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;
    if (!this.context.pixi) return;

    if (DEBUG) {
      console.log('BehaviorSelect: enabling listeners');  // eslint-disable-line no-console
    }

    this._enabled = true;
    this.lastDown = null;
    this.lastMove = null;
    this.lastSpace = null;
    this._multiSelection.clear();

    this._keybinding
      .on('space', this._spacebar)
      .on('⌥space', this._spacebar);

    const interactionManager = this.context.pixi.renderer.plugins.interaction;
    interactionManager
      .on('pointerdown', this._pointerdown)
      .on('pointermove', this._pointermove)
      .on('pointerup', this._pointerup)
      .on('pointerupoutside', this._pointercancel)  // if up outide, just cancel
      .on('pointercancel', this._pointercancel);

    if (interactionManager.supportsTouchEvents) {
      interactionManager
        .on('touchstart', this._pointerdown)
        .on('touchmove', this._pointermove)
        .on('touchend', this._pointerup)
        .on('touchendoutside', this._pointercancel)
        .on('touchcancel', this._pointercancel);
    }

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
      console.log('BehaviorSelect: disabling listeners');  // eslint-disable-line no-console
    }

    this._enabled = false;
    this.lastDown = null;
    this.lastMove = null;
    this.lastSpace = null;
    this._multiSelection.clear();

    const interactionManager = this.context.pixi.renderer.plugins.interaction;
    interactionManager
      .off('pointerdown', this._pointerdown)
      .off('pointermove', this._pointermove)
      .off('pointerup', this._pointerup)
      .off('pointerupoutside', this._pointercancel)  // if up outide, just cancel
      .off('pointercancel', this._pointercancel);

    if (interactionManager.supportsTouchEvents) {
      interactionManager
        .off('touchstart', this._pointerdown)
        .off('touchmove', this._pointermove)
        .off('touchend', this._pointerup)
        .off('touchendoutside', this._pointercancel)
        .off('touchcancel', this._pointercancel);
    }

    d3_select(document)
      .call(this._keybinding.unbind);
  }


  /**
   * _pointerdown
   * Handler for pointerdown events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointerdown(e) {
    if (this.lastDown) return;  // a pointer is already down

    // If pointer is not over the renderer, just discard
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    const context = this.context;
    const interactionManager = context.pixi.renderer.plugins.interaction;
    const pointerOverRenderer = interactionManager.mouseOverRenderer;

    // However, do not discard if the event was a touch event.
    if (!pointerOverRenderer && e.data.pointerType !== 'touch') return;

    const down = this._getEventData(e);
    this.lastDown = down;
    this.lastMove = null;
  }


  /**
   * _pointermove
   * Handler for pointermove events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointermove(e) {
    // If pointer is not over the renderer, just discard
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    const context = this.context;
    const interactionManager = context.pixi.renderer.plugins.interaction;
    const pointerOverRenderer = interactionManager.mouseOverRenderer;
    if (!pointerOverRenderer) return;

    const down = this.lastDown;
    const move = this._getEventData(e);
    if (!down || down.id !== move.id) return;  // not down, or different pointer

    // We get a lot more move events than we need,
    // so discard ones where it hasn't actually moved much
    if (this.lastMove && vecEqual(move.coord, this.lastMove.coord, 0.9)) return;
    this.lastMove = move;

    // If the pointer moves too much, we consider it as a drag, not a click, and set `isCancelled=true`
    if (!down.isCancelled) {
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
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointerup(e) {
    const down = this.lastDown;
    const up = this._getEventData(e);
    if (!down || down.id !== up.id) return;  // not down, or different pointer

    this.lastDown = null;

    if (down.isCancelled) return;   // was cancelled already by moving too much

    const context = this.context;
    const dist = vecLength(down.coord, up.coord);

    if (dist < NEAR_TOLERANCE || (dist < FAR_TOLERANCE && (up.time - down.time) < 500)) {
      // Prevent a quick second click
      context.map().dblclickZoomEnable(false);
      d3_select(window).on('click.draw-block', (e) => e.stopPropagation(), true);

      window.setTimeout(() => {
        context.map().dblclickZoomEnable(true);
        d3_select(window).on('click.draw-block', null);
      }, 500);

      // trigger a click
      this._click(up);

      if (down.originalEvent.button === 2) {  //right click
        this._contextmenu(up);
      }

    }
  }


  /**
   * _pointercancel
   * Handler for pointercancel events.
   * @param  `e`  A Pixi InteractionEvent
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
    if (e.keyCode === 32) {   // spacebar
      // ignore spacebar events during text input
      const activeNode = document.activeElement;
      if (activeNode && new Set(['INPUT', 'TEXTAREA']).has(activeNode.nodeName)) return;

      this._spacebar(e);
      return;

    } else if (e.keyCode === 93) {   // contextmenu key
      // this._lastInteractionType = 'menukey';
      this._contextmenu(this._getEventData(e));
      return;
    }

    if (e.shiftKey) {
      // ?
      return;
    }
  }


  /**
   * _spacebar
   * Handler for `keydown` events of the spacebar
   * We use these to simulate clicks
   * @param  `e`  A d3 keydown event
   */
  _spacebar(e) {
    e.preventDefault();
    e.stopPropagation();

    // For spacebar clicks we will instead use the last pointer event
    // Get these from Pixi's interaction manager
    const interactionManager = this.context.pixi.renderer.plugins.interaction;
    const pointerOverRenderer = interactionManager.mouseOverRenderer;
    const pointerEvent = interactionManager.mouse;
    if (!pointerEvent || !pointerOverRenderer) return;

    const pointer = this._getEventData({ data: pointerEvent });

  console.log(`!!! pointer.target = ${pointer.target}`);
  if (this.lastMove) {
   console.log(`!!! lastMove.target = ${this.lastMove.target}`);
  }

    // Because spacebar events will repeat if you keep it held down,
    // user must move pointer or lift spacebar to allow another spacebar click
    if (this._spaceClickDisabled && this.lastSpace) {
      const dist = vecLength(pointer.coord, this.lastSpace.coord);
      if (dist > FAR_TOLERANCE) {     // pointer moved far enough
        this._spaceClickDisabled = false;
      }
    }

    if (!this._spaceClickDisabled) {
      this._spaceClickDisabled = true;
      this.lastSpace = pointer;

      d3_select(window).on('keyup.space-block', (e) => {   // user lifted spacebar up
        if (e.code !== 'Space') return;  // only spacebar
        e.preventDefault();
        e.stopPropagation();
        this._spaceClickDisabled = false;
        d3_select(window).on('keyup.space-block', null);
      });

      // simulate a click
      this._click(pointer);
    }
  }


  /**
   * _click
   * Once we have determined that the user has clicked, this is where we handle that click.
   * Note this is not a true `click` event handler - we get into here from `_pointerup` or `_spacebar`.
   * @param  `eventData`  event data
   */
  _click(eventData) {
    const context = this.context;
    const mode = context.mode();
    let datum = eventData.data;

//// vvv---- this needs to be done a different way
//// Selection can happen other ways, without direct user interaction
//// For example, after adding a point that point needs to be selected.
//// so instead - the renderer will need to listen to the context mode change events,
//// and this code below will just do mode changes with context.enter
//    // highlight
//    const target = eventData.target;
//    const renderer = context.map().renderer();
//    const ids = datum ? [target.name] : [];
//    renderer.select(ids);
/////

    // What did we click on?
    // switch modes

    // Clicked on nothing
    if (!datum) {
      if (mode.id !== 'browse' && !this._multiSelection.size) {
        context.enter('browse');
      }
      return;
    }

    // Clicked a non-OSM feature..
    if (
      datum.__fbid__ ||              // Clicked a RapiD feature..
      datum.__featurehash__ ||       // Clicked Custom Data (e.g. gpx track)
      datum instanceof osmNote ||    // Clicked an OSM Note...
      datum instanceof QAItem        // Clicked a QA Item (keepright, osmose, improveosm)...
    ) {
      const selection = new Map().set(datum.id, datum);
      context.enter('select', { selection: selection });
      return;
    }

    // Clicked a midpoint..
    // Treat midpoints as if targeting the parent way, and continue matching.
    if (datum.type === 'midpoint') {
      datum = datum.parents[0];
    }

    // Clicked an OSM feature..
    if (datum instanceof osmEntity) {
      // keep it really simple for now - legacy Select mode
      context.enter(modeSelect(context, [datum.id]));
    }

    // Clicked on a photo, so open / refresh the viewer's pic
    if (datum.captured_at) {
      // Now, determine the layer that was clicked on, obtain its service.
      const photoLayerName = eventData.target.parent.name;
      const service = services[photoLayerName];
      if (!service) return;

      // The 'ID' of the photo varies by layer. Streetside uses 'key', others use 'id'.
      const photoID = (photoLayerName === 'mapillary') ? datum.id : datum.key;

      service.ensureViewerLoaded(context)
        .then(() => service.selectImage(context, photoID).showViewer(context));

      context.map().centerEase(datum.loc);

      // No mode change event here, just manually tell the renderer to select it, for now
      const target = eventData.target;
      const renderer = context.map().renderer();
      const ids = datum ? [target.name] : [];
      renderer.select(ids);
    }

  }

//
//    // figure it out
//    let selectedIDs = context.selectedIDs();
//    let newMode = null;
//    let alsoSelectId = null;
//    const showMenu = false;
//    const isMultiselect = false;
//
//
//    if (!isMultiselect) {
//      // don't change the selection if we're toggling the menu atop a multiselection
//      if (!showMenu || selectedIDs.length <= 1 || selectedIDs.indexOf(datum.id) === -1) {
//        if (alsoSelectId === datum.id) alsoSelectId = null;
//
//        selectedIDs = (alsoSelectId ? [alsoSelectId] : []).concat([datum.id]);
//        // always enter modeSelect even if the entity is already
//        // selected since listeners may expect `context.enter` events,
//        // e.g. in the walkthrough
//       newMode = mode.id === 'select' ? mode.selectedIDs(selectedIDs) : modeSelect(context, selectedIDs).selectBehavior(this);
//        context.enter(newMode);
//      }
//    }
//  }

//      } else {
//        if (selectedIDs.indexOf(datum.id) !== -1) {
//          // clicked entity is already in the selectedIDs list..
//          if (!showMenu) {
//            // deselect clicked entity, then reenter select mode or return to browse mode..
//            selectedIDs = selectedIDs.filter(function(id) { return id !== datum.id; });
//            newMode = selectedIDs.length ? mode.selectedIDs(selectedIDs) : modeBrowse(context).selectBehavior(this);
//            context.enter(newMode);
//          }
//        } else {
//          // clicked entity is not in the selected list, add it..
//          selectedIDs = selectedIDs.concat([datum.id]);
//          newMode = mode.selectedIDs(selectedIDs);
//          context.enter(newMode);
//        }
//      }
//      return;
//    }
//
//    // Clicked custom data (e.g. gpx track)
//    if (datum && datum.__featurehash__) {
//      context.selectedNoteID(null);
//      context.selectedErrorID(null);
//      context.enter(modeSelectData(context, datum));
//      return;
//    }
//
//    // Clicked an OSM Note
//    if (datum instanceof osmNote) {
//      context.selectedNoteID(datum.id);
//      context.selectedErrorID(null);
//      context.enter(modeSelectNote(context, datum.id));
//      return;
//    }
//
//    // Clicked a QA Issue (keepright, osmose, etc)
//    if (datum instanceof QAItem) {
//      context.selectedNoteID(null);
//      context.selectedErrorID(datum.id);
//      context.enter(modeSelectError(context, datum.id, datum.service));
//      return;
//    }
//
////    context.ui().closeEditMenu();
//    // always request to show the edit menu in case the mode needs it
//    if (this._showMenu) {
//        const pointer = this._getEventData(eventData);
//
//      // context.ui().showEditMenu(pointer.coord, this._lastInteractionType);
//      context.ui().showEditMenu(pointer.coord);
//    }
//  }


   /**
    * _contextmenu
    * Handler for `contextmenu` events, will be either a pointer event
    * for the right button, or a dedicated keydown event for a contextmenu button
    * @param  `eventData`  event data
    */
   _contextmenu(eventData) {
     //  e.preventDefault();
     // this._lastMouseEvent = e;
     // this._lastInteractionType = 'rightclick';
     this._showMenu = true;

     const datum = eventData.data;

     // Only attempt to display the context menu if we're clicking on a non-rapid OSM Entity.
     if (datum && datum instanceof osmEntity && !datum.__fbid__) {
      // For contextmenu key events we will instead use the last pointer event
      // Get these from Pixi's interaction manager
      const interactionManager = this.context.pixi.renderer.plugins.interaction;
      const pointerOverRenderer = interactionManager.mouseOverRenderer;
      const pointerEvent = interactionManager.mouse;
      if (!pointerEvent || !pointerOverRenderer) return;

      const pointer = this._getEventData({ data: pointerEvent });
      this.context.ui().showEditMenu(pointer.coord);
    }
  }


  resetProperties() {
    // cancelLongPress();
    this._showMenu = false;
    this._lastInteractionType = null;
    // don't reset _lastMouseEvent since it might still be useful
  }

}
//
//
//
//////////////////////////
//
//
//export function behaviorSelect(context) {
//    var _tolerancePx = 4; // see also behaviorDrag
//    var _lastMouseEvent = null;
//    var _showMenu = false;
//    var _downPointers = {};
//    var _longPressTimeout = null;
//    var _lastInteractionType = null;
//    // the id of the down pointer that's enabling multiselection while down
//    var _multiselectionPointerId = null;
//    var _initialized = false;
//
//
//    function keydown(d3_event) {
//        if (d3_event.keyCode === 32) {
//            // don't react to spacebar events during text input
//            var activeNode = document.activeElement;
//            if (activeNode && new Set(['INPUT', 'TEXTAREA']).has(activeNode.nodeName)) return;
//        }
//
//        if (d3_event.keyCode === 93 ||  // context menu key
//            d3_event.keyCode === 32) {  // spacebar
//            d3_event.preventDefault();
//        }
//
//        if (d3_event.repeat) return; // ignore repeated events for held keys
//
//        // if any key is pressed the user is probably doing something other than long-pressing
//        cancelLongPress();
//
//        if (d3_event.shiftKey) {
//            context.surface()
//                .classed('behavior-multiselect', true);
//        }
//
//        if (d3_event.keyCode === 32) {  // spacebar
//            if (!_downPointers.spacebar && _lastMouseEvent) {
//                cancelLongPress();
//                _longPressTimeout = window.setTimeout(didLongPress, 500, 'spacebar', 'spacebar');
//
//                _downPointers.spacebar = {
//                    firstEvent: _lastMouseEvent,
//                    lastEvent: _lastMouseEvent
//                };
//            }
//        }
//    }
//
//
//    function keyup(d3_event) {
//        cancelLongPress();
//
//        if (!d3_event.shiftKey) {
//            context.surface()
//                .classed('behavior-multiselect', false);
//        }
//
//        if (d3_event.keyCode === 93) {  // context menu key
//            d3_event.preventDefault();
//            _lastInteractionType = 'menukey';
//            contextmenu(d3_event);
//        } else if (d3_event.keyCode === 32) {  // spacebar
//            var pointer = _downPointers.spacebar;
//            if (pointer) {
//                delete _downPointers.spacebar;
//
//                if (pointer.done) return;
//
//                d3_event.preventDefault();
//                _lastInteractionType = 'spacebar';
//                click(pointer.firstEvent, pointer.lastEvent, 'spacebar');
//            }
//        }
//    }
//
//
//    function pointerdown(pixiEvent) {
//        const id = pixiEvent.data.originalEvent.pointerId.toString();
//
//        cancelLongPress();
//
//        if (pixiEvent.data.buttons && pixiEvent.data.buttons !== 1) return;
//
//        context.ui().closeEditMenu();
//
//        _longPressTimeout = window.setTimeout(didLongPress, 500, id, 'longdown-' + (pixiEvent.data.pointerType || 'mouse'));
//
//        _downPointers[id] = {
//            firstEvent: pixiEvent,
//            lastEvent: pixiEvent
//        };
//    }
//
//
//    function didLongPress(id, interactionType) {
//        var pointer = _downPointers[id];
//        if (!pointer) return;
//
//        for (var i in _downPointers) {
//            // don't allow this or any currently down pointer to trigger another click
//            _downPointers[i].done = true;
//        }
//
//        // treat long presses like right-clicks
//        _longPressTimeout = null;
//        _lastInteractionType = interactionType;
//        _showMenu = true;
//
//        click(pointer.firstEvent, pointer.lastEvent, id);
//    }
//
//
//    function pointermove(d3_event) {
//        var id = (d3_event.pointerId || 'mouse').toString();
//        if (_downPointers[id]) {
//            _downPointers[id].lastEvent = d3_event;
//        }
//        if (!d3_event.pointerType || d3_event.pointerType === 'mouse') {
//            _lastMouseEvent = d3_event;
//            if (_downPointers.spacebar) {
//                _downPointers.spacebar.lastEvent = d3_event;
//            }
//        }
//    }
//
//    function pointerup(pixiEvent) {
//        const id = pixiEvent.data.originalEvent.pointerId.toString();
//        let pointer = _downPointers[id];
//        if (!pointer) return;
//
//        delete _downPointers[id];
//
//        if (_multiselectionPointerId === id) {
//            _multiselectionPointerId = null;
//        }
//
//
//        if (pointer.done) return;
//
//        click(pointer.firstEvent, pixiEvent, id);
//    }
//
//
//    function pointercancel(d3_event) {
//        var id = (d3_event.pointerId || 'mouse').toString();
//        if (!_downPointers[id]) return;
//
//        delete _downPointers[id];
//
//        if (_multiselectionPointerId === id) {
//            _multiselectionPointerId = null;
//        }
//    }
//
//
//    function contextmenu(d3_event) {
//        d3_event.preventDefault();
//
//        if (!+d3_event.clientX && !+d3_event.clientY) {
//            if (_lastMouseEvent) {
//                d3_event.sourceEvent = _lastMouseEvent;
//            } else {
//                return;
//            }
//        } else {
//            _lastMouseEvent = d3_event;
//            _lastInteractionType = 'rightclick';
//        }
//
//        _showMenu = true;
//        click(d3_event, d3_event);
//    }
//
//
//    function click(firstEvent, lastEvent, pointerId) {
//        cancelLongPress();
//
//        let point = [lastEvent.data.global.x, lastEvent.data.global.y];
//
//        // TODO: Fix this so that the datum is bound to the same entity that gets the hit target. That way, we won't have to go up the parent chain to find the datum bound to the thing that was clicked on.
//        var targetDatum = lastEvent.target.__data__ || lastEvent.target.parent.__data__;
//
//
//        processClick(targetDatum, false, point, null);
//
//    }
//
//
//    function processClick(datum, isMultiselect, point, alsoSelectId) {
//        var mode = context.mode();
//        var showMenu = _showMenu;
//        var interactionType = _lastInteractionType;
//
//        if (datum && datum.type === 'midpoint') {
//            // treat targeting midpoints as if targeting the parent way
//            datum = datum.parents[0];
//        }
//
//        var newMode;
//        if (datum && datum.__fbid__) {    // clicked a RapiD feature ..
//            context
//                .selectedNoteID(null)
//                .selectedErrorID(null)
//                .enter(modeRapidSelectFeatures(context, datum));
//
//        } else if (datum instanceof osmEntity) {    // clicked an entity..
//            var selectedIDs = context.selectedIDs();
//            context.selectedNoteID(null);
//            context.selectedErrorID(null);
//
//            if (!isMultiselect) {
//                // don't change the selection if we're toggling the menu atop a multiselection
//                if (!showMenu ||
//                    selectedIDs.length <= 1 ||
//                    selectedIDs.indexOf(datum.id) === -1) {
//
//                    if (alsoSelectId === datum.id) alsoSelectId = null;
//
//                    selectedIDs = (alsoSelectId ? [alsoSelectId] : []).concat([datum.id]);
//                    // always enter modeSelect even if the entity is already
//                    // selected since listeners may expect `context.enter` events,
//                    // e.g. in the walkthrough
//                    newMode = mode.id === 'select' ? mode.selectedIDs(selectedIDs) : modeSelect(context, selectedIDs).selectBehavior(behavior);
//                    context.enter(newMode);
//                }
//
//            } else {
//                if (selectedIDs.indexOf(datum.id) !== -1) {
//                    // clicked entity is already in the selectedIDs list..
//                    if (!showMenu) {
//                        // deselect clicked entity, then reenter select mode or return to browse mode..
//                        selectedIDs = selectedIDs.filter(function(id) { return id !== datum.id; });
//                        newMode = selectedIDs.length ? mode.selectedIDs(selectedIDs) : modeBrowse(context).selectBehavior(behavior);
//                        context.enter(newMode);
//                    }
//                } else {
//                    // clicked entity is not in the selected list, add it..
//                    selectedIDs = selectedIDs.concat([datum.id]);
//                    newMode = mode.selectedIDs(selectedIDs);
//                    context.enter(newMode);
//                }
//            }
//
//        } else if (datum && datum.__featurehash__ && !isMultiselect) {
//            // targeting custom data
//            context
//                .selectedNoteID(null)
//                .enter(modeSelectData(context, datum));
//
//        } else if (datum instanceof osmNote && !isMultiselect) {
//            // targeting a note
//            context
//                .selectedNoteID(datum.id)
//                .enter(modeSelectNote(context, datum.id));
//
//        } else if (datum instanceof QAItem & !isMultiselect) {
//            // targeting an external QA issue
//            context
//                .selectedErrorID(datum.id)
//                .enter(modeSelectError(context, datum.id, datum.service));
//
//        } else {
//            // targeting nothing
//            context.selectedNoteID(null);
//            context.selectedErrorID(null);
//            if (!isMultiselect && mode.id !== 'browse') {
//                context.enter('browse');
//            }
//        }
//
//        context.ui().closeEditMenu();
//
//        // always request to show the edit menu in case the mode needs it
//        if (showMenu) context.ui().showEditMenu(point, interactionType);
//
//        resetProperties();
//    }
//
//
//    function cancelLongPress() {
//        if (_longPressTimeout) window.clearTimeout(_longPressTimeout);
//        _longPressTimeout = null;
//    }
//
//
//    function resetProperties() {
//        cancelLongPress();
//        _showMenu = false;
//        _lastInteractionType = null;
//        // don't reset _lastMouseEvent since it might still be useful
//    }
//
//
//    function behavior(selection) {
//        resetProperties();
//        _lastMouseEvent = context.map().lastPointerEvent();
//
//        if (!_initialized) {
//            const stage = context.pixi.stage;
//
//            const lines = stage.getChildByName('lines');
//            const areas = stage.getChildByName('areas');
//            const points = stage.getChildByName('points');
//            const rapid = stage.getChildByName('rapid');
//
//            const interactiveLayers = [lines, areas, points, rapid];
//            interactiveLayers.forEach(layer => layer.on('pointerup', pointerup));
//            interactiveLayers.forEach(layer => layer.on('pointerdown', pointerdown));
//            _initialized = true;
//        }
//        // d3_select(window)
//        //     .on('keydown.select', keydown)
//        //     .on('keyup.select', keyup)
//        //     .on('pointermove.select', pointermove, true)
//        //     .on('pointerup.select', pointerup, true)
//        //     .on('pointercancel.select', pointercancel, true)
//        //     .on('contextmenu.select-window', function(d3_event) {
//        //         // Edge and IE really like to show the contextmenu on the
//        //         // menubar when user presses a keyboard menu button
//        //         // even after we've already preventdefaulted the key event.
//        //         var e = d3_event;
//        //         if (+e.clientX === 0 && +e.clientY === 0) {
//        //             d3_event.preventDefault();
//        //         }
//        //     });
//
//        // selection
//        //     .on('pointerdown.select', pointerdown)
//        //     .on('contextmenu.select', contextmenu);
//
//        /*if (d3_event && d3_event.shiftKey) {
//            context.surface()
//                .classed('behavior-multiselect', true);
//        }*/
//    }
//
//
//    behavior.off = function(selection) {
//        cancelLongPress();
//
//        d3_select(window)
//            .on('keydown.select', null)
//            .on('keyup.select', null)
//            .on('contextmenu.select-window', null)
//            .on('pointermove.select', null, true)
//            .on('pointerup.select', null, true)
//            .on('pointercancel.select', null, true);
//
//        selection
//            .on('pointerdown.select', null)
//            .on('contextmenu.select', null);
//
//        context.surface()
//            .classed('behavior-multiselect', false);
//    };
//
//
//    return behavior;
//}
