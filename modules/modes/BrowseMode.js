import { AbstractMode } from './AbstractMode';
import { operationPaste } from '../operations/paste';
import {cursors} from './index';
import { style } from 'd3';
const DEBUG = false;

/**
 * `BrowseMode` is the default mode that the editor is in.
 *  Nothing selected but users can hover or click on things.
 *  - "operations" allowed (right click edit menu) includes Paste only
 */
export class BrowseMode extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.context = context;
    this.id = 'browse';
    // Make sure the event handlers have `this` bound correctly
    this._hover = this._hover.bind(this);
  }


  /**
   * enter
   */
  enter() {
    if (DEBUG) {
      console.log('BrowseMode: entering');  // eslint-disable-line no-console
    }
    const context = this.context;
    this.operations = [ operationPaste(this.context) ];
    this._active = true;
    context.enableBehaviors(['hover', 'select', 'drag', 'paste', 'lasso', 'map-interaction']);
    context.behaviors.hover
      .on('hoverchange', this._hover);
    // Get focus on the body.
    // I think this was done to remove focus from whatever
    // field the user was using in the sidebar/inspector?
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;
    if (DEBUG) {
      console.log('BrowseMode: exiting');  // eslint-disable-line no-console
    }
    this.context.behaviors.hover.off('hoverchange', this._hover);
  }


  sidebar() {
    console.error('error: do not call BrowseMode.sidebar anymore');   // eslint-disable-line no-console
  }

  /**
   * _hover
   * Changes the cursor styling based on what geometry is hovered
   */
  _hover(eventData) {
    const context = this.context;
    const graph = context.graph();
    const { target } = eventData;
    const datum = target?.data;
    const entity = datum && graph.hasEntity(datum.id);
    const geom = entity?.geometry(graph) ?? 'grab';
    const eventManager = this.context.systems.map.renderer.events;
    // console.log(eventManager);
    if (geom) {
      switch (geom) {
        case 'line':
          eventManager.setCursor(cursors.lineCursor);
          // document.body.style.cursor = 'url(/img/cursor-select-line.png), pointer';
          // console.log();
          break;
        case 'vertex':
          eventManager.setCursor(cursors.vertexCursor);
          // console.log(eventManager.setCursor(cursors.vertexCursor));
          break;
        case 'point':
          eventManager.setCursor(cursors.pointCursor);
          break;
        case 'area':
          eventManager.setCursor(cursors.areaCursor);
          break;
        default:
            eventManager.setCursor('grab');
          break;
      }
    }
  }
}

