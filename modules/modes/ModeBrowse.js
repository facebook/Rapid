import * as PIXI from 'pixi.js';
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
   * Changes the cursor styling based on what geometry is hovered
   */
  _hover(eventData) {
    const context = this.context;
    const textures = context.pixi.rapidTextures;
    const graph = context.graph();
    const target = eventData.target;
    const datum = target && target.data;
    const entity = datum && graph.hasEntity(datum.id);
    const geom = entity && entity.geometry(graph);

    if (geom && (geom === 'line' || geom === 'vertex' || geom === 'area' || geom === 'point')) {
      const cursorType = new PIXI.Sprite(textures.get(geom));
      cursorType.anchor.set(0.5, 0.5);
      document.body.style.cursor = `url(${cursorType._texture.textureCacheIds[0]}),auto`;
    } else {
      document.body.style.cursor = 'url(/img/cursor/cursor-grab.png),auto';
    }
  }
}

