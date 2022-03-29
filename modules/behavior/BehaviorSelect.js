import { select as d3_select } from 'd3-selection';
import { vecLength } from '@id-sdk/math';

import { AbstractBehavior } from './AbstractBehavior';
import { modeBrowse } from '../modes/browse';
import { modeSelect } from '../modes/select';
import { modeSelectData } from '../modes/select_data';
import { modeSelectNote } from '../modes/select_note';
import { modeSelectError } from '../modes/select_error';
import { osmEntity, osmNote, QAItem } from '../osm';
import { utilKeybinding } from '../util';

import { modeRapidSelectFeatures } from '../modes/rapid_select_features';

const NEAR_TOLERANCE = 4;
const FAR_TOLERANCE = 12;


/**
 * `BehaviorSelect` listens to pointer events
 * and selects items that are clicked on.
 */
export class BehaviorSelect extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared context for iD
   */
  constructor(context) {
    super(context);

    this._multiSelection = new Set();
    this._spaceClickDisabled = false;
    this._lastSpaceCoord = null;
    this._downData = null;

    this._keybinding = utilKeybinding('selectbehavior');

    // Make sure the event handlers have `this` bound correctly
    this._pointerdown = this._pointerdown.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._pointerup = this._pointerup.bind(this);
    this._pointercancel = this._pointercancel.bind(this);
    this._showMenu = false;
    this._lastInteractionType = null;
  }

  /**
   * enable
   * Bind event handlers
   */
  enable() {
    this._downData = null;
    this._multiSelection.clear();

    if (!this._context.pixi) return;
    const stage = this._context.pixi.stage;

    this._keybinding
      .on('space', (e) => this._spacebar(e))
      .on('⌥space', (e) => this._spacebar(e));

    stage
      .on('pointerdown', this._pointerdown)
      .on('pointermove', this._pointermove)
      .on('pointerup', this._pointerup)
      .on('pointerupoutside', this._pointercancel)  // if up outide, just cancel
      .on('pointercancel', this._pointercancel);

    d3_select(document)
      .call(this._keybinding);

    this._enabled = true;
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;

    if (!this._context.pixi) return;
    const stage = this._context.pixi.stage;

    stage
      .off('pointerdown', this._pointerdown)
      .off('pointermove', this._pointermove)
      .off('pointerup', this._pointerup)
      .off('pointerupoutside', this._pointercancel)  // if up outide, just cancel
      .off('pointercancel', this._pointercancel);

    d3_select(document)
      .call(this._keybinding.unbind);

    this._enabled = false;
  }


  /**
   * _getEventData
   * Returns an object containing the important details about this Pixi event
   * @param  `e`  A Pixi InteractionEvent
   */
  _getEventData(e) {
    const result = {
      id: e.data.originalEvent.pointerId || 'mouse',
      event: e,
      origEvent: e.data.originalEvent,
      coord: [e.data.originalEvent.offsetX, e.data.originalEvent.offsetY],
      time: e.data.originalEvent.timeStamp,
      isCancelled: false,
      target: null,
      data: null
    };

    if (!e.target) {   // e.target is the displayObject that triggered this event
      return result;
    }

    let target = e.target;
    let data = target && target.__data__;

    // Data is here, use this target
    if (data) {
      result.target = target;
      result.data = data;
      return result;
    }

    // No data in target, look in parent
    target = e.target.parent;
    data = target && target.__data__;
    if (data) {
      result.target = target;
      result.data = data;
      return result;
    }

    // No data there either, just use the original target
    result.target = e.target;
    return result;
  }


  /**
   * _pointerdown
   * Handler for pointerdown events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_downData`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointerdown(e) {
    if (this._downData) return;  // a pointer is already down

    const down = this._getEventData(e);
    // const name = (down.target && down.target.name) || 'no target';
    // console.log(`pointerdown ${name}`);
    this._downData = down;
  }


  /**
   * _pointerup
   * Handler for pointerup events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_downData`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointerup(e) {
    const up = this._getEventData(e);
    const down = this._downData;
    // const name = (up.target && up.target.name) || 'no target';
    // console.log(`pointerup ${name}`);

    if (!down || down.id !== up.id) return;  // not down, or different pointer

    this._downData = null;

    if (down.isCancelled) return;   // was cancelled already by moving too much

    const context = this._context;
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


    if (down.origEvent.button === 2) {
      //right click means context menu
      this.contextmenu(e);
    }

    }
  }


  /**
   * _pointermove
   * Handler for pointermove events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_downData`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointermove(e) {
    const move = this._getEventData(e);
    const down = this._downData;
    // const name = (move.target && move.target.name) || 'no target';
    // console.log(`pointermove ${name}`);

    if (!down || down.id !== move.id) return;  // not down, or different pointer

    // If the pointer moves too much, we consider it as a drag, not a click, and set `isCancelled=true`
    if (!down.isCancelled) {
      const dist = vecLength(down.coord, move.coord);
      if (dist >= NEAR_TOLERANCE) {
        down.isCancelled = true;
      }
    }
  }


  /**
   * _pointercancel
   * Handler for pointercancel events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_downData`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointercancel() {
    // const cancel = this._getEventData(e);
    // const down = this._downData;
    // const name = (cancel.target && cancel.target.name) || 'no target';
    // console.log(`pointercancel ${name}`);

    // Here we can throw away the down data to prepare for another `pointerdown`.
    // After pointercancel, there should be no more `pointermove` or `pointerup` events.
    this._downData = null;
  }


  /**
   * _keydown
   * Handler for keydown events.
   * @param  `e`  A d3 event
   */
  _keydown(e) {
    if (e.keyCode === 32) {   // spacebar
      // ignore spacebar events during text input
      const activeNode = document.activeElement;
      if (activeNode && new Set(['INPUT', 'TEXTAREA']).has(activeNode.nodeName)) return;

      this._spacebar(e);
      return;
    }

    if (e.keyCode === 93) {   // contextmenu key
      this._lastInteractionType = 'menukey';
      this.contextmenu(e);
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
    const interactionManager = this._context.pixi.renderer.plugins.interaction;
    const pointerOverRenderer = interactionManager.mouseOverRenderer;
    const pointerEvent = interactionManager.mouse;
    if (!pointerEvent || !pointerOverRenderer) return;

    const pointer = this._getEventData({ data: pointerEvent });

    // User must move pointer or lift spacebar to allow another spacebar click
    if (this._spaceClickDisabled && this._lastSpaceCoord) {
      const dist = vecLength(this._lastSpaceCoord, pointer.coord);
      if (dist > FAR_TOLERANCE) {
        this._spaceClickDisabled = false;
      }
    }

    if (!this._spaceClickDisabled) {
      this._spaceClickDisabled = true;
      this._lastSpaceCoord = pointer.coord;

      d3_select(window).on('keyup.space-block', (e) => {
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
    // const name = (eventData.target && eventData.target.name) || 'no target';
    // console.log(`click ${name}`);

    const context = this._context;
    const mode = context.mode();
    let datum = eventData.data;

    // const showMenu = _showMenu;
    // const interactionType = _lastInteractionType;

    // context.ui().closeEditMenu();   //?

    // highlight
    const target = eventData.target;
    const renderer = context.map().renderer();
    const ids = datum ? [target.name] : [];
    renderer.highlight(ids);

    //
    // What did we click on?
    //

    // Clicked on nothing
    if (!datum) {
      context.selectedNoteID(null);
      context.selectedErrorID(null);
      if (mode.id !== 'browse' && !this._multiSelection.size) {
        context.enter(modeBrowse(context));
      }
      return;
    }

    // Clicked a midpoint..
    // Treat midpoints as if targeting the parent way, and continue matching.
    if (datum.type === 'midpoint') {
      datum = datum.parents[0];
    }

    // Clicked a RapiD feature..
    if (datum.__fbid__) {
      context.selectedNoteID(null);
      context.selectedErrorID(null);
      context.enter(modeRapidSelectFeatures(context, datum));
      return;
    }

    // Clicked an OSM feature..
    if (datum instanceof osmEntity) {
      context.selectedNoteID(null);
      context.selectedErrorID(null);

    // figure it out
    let selectedIDs = context.selectedIDs();
    let newMode = null;
    let alsoSelectId = null;
    const showMenu = false;
    const isMultiselect = false;


      if (!isMultiselect) {
        // don't change the selection if we're toggling the menu atop a multiselection
        if (!showMenu || selectedIDs.length <= 1 || selectedIDs.indexOf(datum.id) === -1) {
          if (alsoSelectId === datum.id) alsoSelectId = null;

          selectedIDs = (alsoSelectId ? [alsoSelectId] : []).concat([datum.id]);
          // always enter modeSelect even if the entity is already
          // selected since listeners may expect `context.enter` events,
          // e.g. in the walkthrough
          newMode = mode.id === 'select' ? mode.selectedIDs(selectedIDs) : modeSelect(context, selectedIDs).selectBehavior(this);
          context.enter(newMode);
        }

      } else {
        if (selectedIDs.indexOf(datum.id) !== -1) {
          // clicked entity is already in the selectedIDs list..
          if (!showMenu) {
            // deselect clicked entity, then reenter select mode or return to browse mode..
            selectedIDs = selectedIDs.filter(function(id) { return id !== datum.id; });
            newMode = selectedIDs.length ? mode.selectedIDs(selectedIDs) : modeBrowse(context).selectBehavior(this);
            context.enter(newMode);
          }
        } else {
          // clicked entity is not in the selected list, add it..
          selectedIDs = selectedIDs.concat([datum.id]);
          newMode = mode.selectedIDs(selectedIDs);
          context.enter(newMode);
        }
      }
      return;
    }


    // Clicked custom data (e.g. gpx track)
    if (datum && datum.__featurehash__) {
      context.selectedNoteID(null);
      context.selectedErrorID(null);
      context.enter(modeSelectData(context, datum));
      return;
    }

    // Clicked an OSM Note
    if (datum instanceof osmNote) {
      context.selectedNoteID(datum.id);
      context.selectedErrorID(null);
      context.enter(modeSelectNote(context, datum.id));
      return;
    }

    // Clicked a QA Issue (keepright, osmose, etc)
    if (datum instanceof QAItem) {
      context.selectedNoteID(null);
      context.selectedErrorID(datum.id);
      context.enter(modeSelectError(context, datum.id, datum.service));
      return;
    }

//    context.ui().closeEditMenu();
    // always request to show the edit menu in case the mode needs it
    if (this._showMenu) {
        const pointer = this._getEventData(eventData);

      context.ui().showEditMenu(pointer.coord, this._lastInteractionType);
    }
  }

   contextmenu(e) {
      //  e.preventDefault();

      //  if (!+e.clientX && !+e.clientY) {
      //      if (this._lastMouseEvent) {
      //          e.sourceEvent = this._lastMouseEvent;
      //      } else {
      //          return;
      //      }
      //  } else {
      //      this._lastMouseEvent = e;
      //      this._lastInteractionType = 'rightclick';
      //  }
      this._lastMouseEvent = e;
      this._lastInteractionType = 'rightclick';

       this._showMenu = true;
       this._click(e);
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
//                context.enter(modeBrowse(context));
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
