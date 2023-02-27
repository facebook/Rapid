import { operationPaste } from '../operations/paste';
import { AbstractMode } from './AbstractMode';
const DEBUG = false;


/**
 * `ModeBrowse` is the default mode that the editor is in.
 *  Nothing selected but users can hover or click on things.
 *  - "operations" allowed (right click edit menu) includes Paste only
 */
export class ModeBrowse extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.context = context;
    this.id = 'browse';
  }


  /**
   * enter
   */
  enter() {
    if (DEBUG) {
      console.log('ModeBrowse: entering');  // eslint-disable-line no-console
    }

    document.body.style.cursor = 'url(/img/cursor/cursor-grab.png),auto';
    this.operations = [ operationPaste(this.context) ];
    this._active = true;
    this._wasData = false;
    this.context.enableBehaviors(['hover', 'select', 'drag', 'paste', 'lasso', 'map-interaction']);
    this.context.behaviors.get('hover').on('hoverchanged', this._hover);
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
      console.log('ModeBrowse: exiting');  // eslint-disable-line no-console
    }

    this.context.behaviors.get('hover').off('hoverchanged', this._hover);
  }


  selectBehavior() {
    console.error('error: do not call modeBrowse.selectBehavior anymore');  // eslint-disable-line no-console
  }
  sidebar() {
    console.error('error: do not call modeBrowse.sidebar anymore');   // eslint-disable-line no-console
  }

  /**
   * _hover
   * Hover changed cursor styling based one what geometry is hovered
   */
  _hover(eventData) {
    // Get the current context and graph
    // const cursorPoint = this.textures.get('vertex');
    // const cursorSpritePoint = new PIXI.Sprite(cursorPoint);

    const context = this.context;
    const graph = context.graph();
    // Get the target and associated datum
    const target = eventData.target;
    const datum = target && target.data;
    // Check if the datum is an entity in the graph
    const entity = datum && graph.hasEntity(datum.id);
    // Get the geometry of the entity, if it exists
    const geom = entity && entity.geometry(graph);
    // Change the cursor of the document body based on the geometry type
    if (geom && geom === 'vertex') {
      document.body.style.cursor = 'url(/img/cursor/cursor-select-vertex.png),auto';
    } else if (geom && geom === 'line') {
      document.body.style.cursor = 'url(/img/cursor/cursor-select-line.png),auto';
    } else if (geom && geom === 'area') {
      document.body.style.cursor = 'url(/img/cursor/cursor-select-area.png),auto';
    } else if (geom && geom === 'point') {
      document.body.style.cursor = 'url(/img/cursor/cursor-select-point.png),auto';
    } else {
      // If there is no entity or the entity's geometry is unknown, use the grab cursor
      document.body.style.cursor = 'url(/img/cursor/cursor-grab.png),auto';
    }
  }
}

