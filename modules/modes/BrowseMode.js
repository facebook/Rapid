import { AbstractMode } from './AbstractMode.js';
import { operationPaste } from '../operations/paste.js';

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
   * Enters the mode.
   */
  enter() {
    if (DEBUG) {
      console.log('BrowseMode: entering');  // eslint-disable-line no-console
    }

    const context = this.context;
    this._active = true;

    this.operations = [ operationPaste(context) ];
    context.enableBehaviors(['hover', 'select', 'drag', 'paste', 'lasso', 'mapInteraction']);

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

    this.operations = [];

    if (DEBUG) {
      console.log('BrowseMode: exiting');  // eslint-disable-line no-console
    }

    this.context.behaviors.hover
      .off('hoverchange', this._hover);
  }


  /**
   * _hover
   * Changes the cursor styling based on what geometry is hovered
   */
  _hover(eventData) {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const eventManager = context.systems.map.renderer.events;

    const target = eventData.target;
    const datum = target?.data;
    const entity = datum && graph.hasEntity(datum.id);
    const geom = entity?.geometry(graph) ?? 'unknown';

    switch (geom) {
      case 'area':
        eventManager.setCursor('areaCursor');
        break;
      case 'line':
        eventManager.setCursor('lineCursor');
        break;
      case 'point':
        eventManager.setCursor('pointCursor');
        break;
      case 'vertex':
        eventManager.setCursor('vertexCursor');
        break;
      default:
        eventManager.setCursor('grab');
        break;
    }
  }
}

