import { AbstractBehavior } from './AbstractBehavior.js';
// import { geoChooseEdge } from '../geo/index.js';
import { utilDetect } from '../util/detect.js';


/**
 * `HoverBehavior` listens to pointer events emits `hoverchange` events as the user hovers over stuff
 *
 * Properties available:
 *   `enabled`      `true` if the event handlers are enabled, `false` if not.
 *   `lastMove`     `eventData` Object for the most recent move event
 *   `hoverTarget`  `Object` that contains details about the feature being hovered, or `null`
 *
 * Events available:
 *   `hoverchange`  Fires whenever the hover target has changed, receives `eventData` Object
 */
export class HoverBehavior extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'hover';

    this.lastMove = null;
    this.hoverTarget = null;

    // Make sure the event handlers have `this` bound correctly
    this._doHover = this._doHover.bind(this);
    this._pointermove = this._pointermove.bind(this);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;

    this._enabled = true;
    this.lastMove = null;
    this.hoverTarget = null;

    const eventManager = this.context.systems.map.renderer.events;
    eventManager.on('modifierchange', this._doHover);
    eventManager.on('pointerover', this._doHover);
    eventManager.on('pointerout', this._doHover);
    eventManager.on('pointermove', this._pointermove);
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;

    // Something is currently hovered, so un-hover it first.
    const eventData = this.lastMove;
    if (this.hoverTarget && eventData) {
      eventData.target = null;
      this._doHover();
    }

    this._enabled = false;
    this.lastMove = null;
    this.hoverTarget = null;

    const eventManager = this.context.systems.map.renderer.events;
    eventManager.off('modifierchange', this._doHover);
    eventManager.off('pointerover', this._doHover);
    eventManager.off('pointerout', this._doHover);
    eventManager.off('pointermove', this._pointermove);
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove(e) {
    if (!this._enabled) return;

    this.lastMove = this._getEventData(e);
    this._doHover();
  }


  /**
   * _doHover
   * Emits a 'hoverchange' event if needed
   * This may also be fired if we detect a change in the modifier keys.
   */
  _doHover() {
    if (!this._enabled || !this.lastMove) return;  // nothing to do

    const interaction = this.context.behaviors.mapInteraction;
    if (interaction.gesture) return;  // dont change hover while interacting with the map

    const context = this.context;
    const eventManager = context.systems.map.renderer.events;
    const modifiers = eventManager.modifierKeys;
    const isMac = utilDetect().os === 'mac';
    const disableSnap = modifiers.has('Alt') || modifiers.has('Meta') || (!isMac && modifiers.has('Control'));
    const eventData = Object.assign({}, this.lastMove);  // shallow copy

    // Handle situations where we don't want to hover a target way...
    let isActiveTarget = false;
//    if (eventData?.target?.layerID === 'osm') {
//      const mode = context.mode;
//      const target = eventData?.target?.data || null;
//      let activeID;
//      if (mode?.id === 'draw-line') {
//        activeID = mode.drawNode?.id;
//      } else if (mode?.id === 'drag-node') {
//        activeID = mode.dragNode?.id;
//      }
//
//      // If a node being interacted with is on a way being tageted..
//      if (activeID && target?.type === 'way') {
//        const activeIndex = target.nodes.indexOf(activeID);
//        if (activeIndex !== -1) {
//          isActiveTarget = true;
//          const graph = context.systems.editor.staging.graph;
//          const viewport = context.viewport;
//          const choice = geoChooseEdge(graph.childNodes(target), eventData.coord.map, viewport, activeID);
//
//          const SNAP_DIST = 6;  // hack to avoid snap to fill, see #719
//          if (choice && choice.distance < SNAP_DIST) {
//            // We should not target parts of the way that are adjacent ot the active node
//            // but we can target segments of the way that are >2 segments away.
//            if ((choice.index > activeIndex + 2) || (choice.index < activeIndex - 1)) {
//              isActiveTarget = false;
//              eventData.target.choice = choice;
//            }
//          }
//        }
//      }
//    }

    // If a modifier key is down, or pointer is not over the renderer, discard the target..
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    if (disableSnap || isActiveTarget || !eventManager.pointerOverRenderer) {
      eventData.target = null;
    }

    // Check if hover target has changed (coerce undefined -> null for fair comparison)
    const prevID = this.hoverTarget?.featureID || null;
    const currID = eventData?.target?.featureID || null;
    if (prevID !== currID) {
      this.hoverTarget = Object.assign({}, eventData.target);  // shallow copy
      this.emit('hoverchange', eventData);
    }
  }
}
