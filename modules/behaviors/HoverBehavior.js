import { AbstractBehavior } from './AbstractBehavior';
import * as PIXI from 'pixi.js';
// import { geoChooseEdge } from '../geo';


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

    const interaction = this.context.behaviors['map-interaction'];
    if (interaction.gesture) return;  // dont change hover while interacting with the map

    const context = this.context;
    const eventManager = context.systems.map.renderer.events;
    const modifiers = eventManager.modifierKeys;
    const hasModifierKey = modifiers.has('Alt') || modifiers.has('Control') || modifiers.has('Meta');
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
//          const graph = context.graph();
//          const projection = context.projection;
//          const choice = geoChooseEdge(graph.childNodes(target), eventData.coord, projection, activeID);
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
    if (hasModifierKey || isActiveTarget || !eventManager.pointerOverRenderer) {
      eventData.target = null;
    }

    // Check if hover target has changed (coerce undefined -> null for fair comparison)
    const prevID = this.hoverTarget?.featureID || null;
    const currID = eventData?.target?.featureID || null;
    if (prevID !== currID) {
      this.hoverTarget = Object.assign({}, eventData.target);  // shallow copy
      this.emit('hoverchange', eventData);
    }
    //  Cursor changes on Hover
    const graph = context.graph();
    const { target } = eventData;
    const datum = target?.data;
    const entity = datum && graph.hasEntity(datum.id);
    const geom = entity?.geometry(graph) ?? 'grab';
    const mode = context.mode;
    if (geom) {
      switch (geom) {
        case 'line':
          document.body.style.cursor = 'url(/img/cursor-select-line.png), pointer';
          break;
        case 'vertex':
          document.body.style.cursor = 'url(/img/cursor-select-vertex.png), pointer';
          break;
        case 'point':
          document.body.style.cursor = 'url(/img/cursor-select-point.png), pointer';
          break;
        case 'area':
          document.body.style.cursor = 'url(/img/cursor-select-area.png), pointer';
          break;
        default:
            document.body.style.cursor = 'url(/img/cursor-grab.png), auto';
      }
    }
    if (mode?.id === 'draw-line' || mode?.id === 'draw-area') {
      if (geom === 'line') {
        document.body.style.cursor = 'url(/img/cursor-draw-connect-line.png) 9 9, crosshair';
      } else if (geom === 'vertex') {
        document.body.style.cursor = 'url(/img/cursor-draw-connect-vertex.png) 9 9, crosshair';
      } else {
        document.body.style.cursor = 'url(/img/cursor-draw.png) 9 9, crosshair';
      }
    } else if (mode?.id === 'add-point') {
      document.body.style.cursor = 'url(/img/cursor-draw.png) 9 9, auto';
    }
  }
}
