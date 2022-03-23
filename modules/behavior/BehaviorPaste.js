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
   * @param  `context`  Global shared context for iD
   */
  constructor(context) {
    super(context);
  }


  /**
   * enable
   * Bind keypress event handler
   */
  enable() {
    this._context.keybinding()
      .on(uiCmd('⌘V'), (e) => this._onKeypress(e));
    this._enabled = true;
  }


  /**
   * disable
   * Unbind keypress event handler
   */
  disable() {
    if (this._enabled) {
      this._context.keybinding().off(uiCmd('⌘V'));
      this._enabled = false;
    }
  }


  /**
   * _onKeypress
   * Handles the keypress event
   */
  _onKeypress(e) {
    e.preventDefault();

    const context = this._context;
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
