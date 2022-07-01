import { Extent, geomPointInPolygon, vecSubtract } from '@id-sdk/math';

import { AbstractBehavior } from './AbstractBehavior';
import { actionCopyEntities } from '../actions/copy_entities';
import { actionMove } from '../actions/move';
import { modeMove } from '../modes/move';
import { uiCmd } from '../ui/cmd';


/**
 * `BehaviorPaste` binds the keypress event '⌘V' when pasting is allowed
 */
export class BehaviorPaste extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'paste';
    this._keybinding = this.context.keybinding();  // "global" keybinding (on document)

    // Make sure the event handlers have `this` bound correctly
    this._keydown = this._keydown.bind(this);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;

    this._enabled = true;
    this._keybinding.on(uiCmd('⌘V'), this._keydown);
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;

    this._enabled = false;
    this._keybinding.off(uiCmd('⌘V'));
  }


  /**
   * _keydown
   * Handles the keydown event
   * @param  `e`  A d3 keydown event
   */
  _keydown(e) {
    e.preventDefault();

    const context = this.context;
    const startGraph = context.graph();
    const copyGraph = context.copyGraph();
    const mouse = context.map().mouse();
    const projection = context.projection;
    const dimensions = projection.dimensions();
    const viewport = new Extent(dimensions[0], dimensions[1]).polygon();

    if (!geomPointInPolygon(mouse, viewport)) return;

    const oldIDs = context.copyIDs();
    if (!oldIDs.length) return;

    const action = actionCopyEntities(oldIDs, copyGraph);
    context.perform(action);
    const copies = action.copies();

    let extent = new Extent();
    let newIDs = [];
    let originals = new Set();
    Object.values(copies).forEach(entity => originals.add(entity.id));

    for (const id in copies) {
      const oldEntity = copyGraph.entity(id);
      const newEntity = copies[id];

      extent = extent.extend(oldEntity.extent(copyGraph));

      // Exclude child nodes from newIDs if their parent way was also copied.
      const parents = context.graph().parentWays(newEntity);
      const parentCopied = parents.some(parent => originals.has(parent.id));

      if (!parentCopied) {
        newIDs.push(newEntity.id);
      }
    }

    // Try to put pasted features where mouse pointer is..
    const copyPoint = (context.copyLonLat() && projection.project(context.copyLonLat())) || projection.project(extent.center());
    const delta = vecSubtract(mouse, copyPoint);

    context.perform(actionMove(newIDs, delta, projection));
    context.enter(modeMove(context, newIDs, startGraph));
  }

}
