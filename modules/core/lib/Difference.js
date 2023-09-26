import deepEqual from 'fast-deep-equal';
import { vecEqual } from '@rapid-sdk/math';
import { utilArrayUnion } from '@rapid-sdk/util';


/**
 *  Difference
 *  Difference represents the difference between two Graphs.
 *  It knows how to calculate the set of entities that were
 *  created, modified, or deleted, and also contains the logic
 *  for recursively extending a difference to the complete set
 *  of entities that will require a redraw, taking into account
 *  child and parent relationships.
 */
export class Difference {

  /**
   * @constructor
   * @param  base   Base Graph
   * @param  head   Head Graph
   */
  constructor(base, head) {
    this._base = base;
    this._head = head;
    this._changes = new Map();   // Map(entityID -> Object)
    this.didChange = {};         // 'addition', 'deletion', 'geometry', 'properties'

    if (base === head) return;   // same Graph, no difference

    // Gather affected ids
    const ids = new Set([...head.local.entities.keys(), ...base.local.entities.keys()]);

    // Check each id to determine whether it has changed from base -> head..
    for (const id of ids) {
      const h = head.hasEntity(id);
      const b = base.hasEntity(id);
      if (h === b) continue;  // no change

      if (b && !h) {
        this._changes.set(id, { base: b, head: h });
        this.didChange.deletion = true;
        continue;
      }
      if (!b && h) {
        this._changes.set(id, { base: b, head: h });
        this.didChange.addition = true;
        continue;
      }

      if (h && b) {
        if (h.members && b.members && !deepEqual(h.members, b.members)) {
          this._changes.set(id, { base: b, head: h });
          this.didChange.geometry = true;
          this.didChange.properties = true;
          continue;
        }
        if (h.loc && b.loc && !vecEqual(h.loc, b.loc)) {
          this._changes.set(id, { base: b, head: h });
          this.didChange.geometry = true;
        }
        if (h.nodes && b.nodes && !deepEqual(h.nodes, b.nodes)) {
          this._changes.set(id, { base: b, head: h });
          this.didChange.geometry = true;
        }
        if (h.tags && b.tags && !deepEqual(h.tags, b.tags)) {
          this._changes.set(id, { base: b, head: h });
          this.didChange.properties = true;
        }
      }
    }
  }


  /**
   * changes
   * @readonly
   * @return  Map(entityID -> change Object)
   */
  get changes() {
    return this._changes;
  }


  /**
   * modified
   * @return  `Array`
   */
  modified() {
    let result = [];
    for (const change of this._changes.values()) {
      if (change.base && change.head) {
        result.push(change.head);
      }
    }
    return result;
  }


  /**
   * created
   * @return  `Array`
   */
  created() {
    let result = [];
    for (const change of this._changes.values()) {
      if (!change.base && change.head) {
        result.push(change.head);
      }
    }
    return result;
  }


  /**
   * deleted
   * @return  `Array`
   */
  deleted() {
    let result = [];
    for (const change of this._changes.values()) {
      if (change.base && !change.head) {
        result.push(change.base);
      }
    }
    return result;
  }


  /**
   * summary
   * Generates a difference "summary" in a format like what is presented on the
   * pre-save commit component, with list items like "created", "modified", "deleted".
   * @return  Map(entityID -> change detail)
   */
  summary() {
    const base = this._base;
    const head = this._head;
    const result = new Map();  // Map(entityID -> change detail)

    for (const change of this._changes.values()) {
      const h = change.head;
      const b = change.base;

      if (h && h.geometry(head) !== 'vertex') {
        _addEntity(h, head, b ? 'modified' : 'created');

      } else if (b && b.geometry(base) !== 'vertex') {
        _addEntity(b, base, 'deleted');

      } else if (b && h) {  // modified vertex
        const moved = !vecEqual(b.loc, h.loc);
        const retagged = !deepEqual(b.tags, h.tags);
        if (moved) {
          for (const parent of head.parentWays(h)) {
            if (result.has(parent.id)) continue;
            _addEntity(parent, head, 'modified');
          }
        }
        if (retagged || (moved && h.hasInterestingTags())) {
          _addEntity(h, head, 'modified');
        }

      } else if (h && h.hasInterestingTags()) {  // created vertex
        _addEntity(h, head, 'created');

      } else if (b && b.hasInterestingTags()) {  // deleted vertex
        _addEntity(b, base, 'deleted');
      }
    }

    return result;


    function _addEntity(entity, graph, changeType) {
      result.set(entity.id, { entity: entity, graph: graph, changeType: changeType });
    }
  }


  /**
   * complete
   * Returns complete set of entities affected by a change.
   * This is used to know which entities need redraw or revalidation
   * @return  Map(entityID -> Entity)
   */
  complete() {
    const head = this._head;
    const result = new Map();  // Map(entityID -> Entity)

    for (const [entityID, change] of this._changes) {
      const h = change.head;
      const b = change.base;
      const entity = h || b;

      result.set(entityID, h);

      if (entity.type === 'way') {
        const headNodes = h ? h.nodes : [];
        const baseNodes = b ? b.nodes : [];
        for (const nodeID of utilArrayUnion(headNodes, baseNodes)) {
          result.set(nodeID, head.hasEntity(nodeID));
        }
      }

      if (entity.type === 'relation' && entity.isMultipolygon()) {
        const headMembers = h ? h.members.map(m => m.id) : [];
        const baseMembers = b ? b.members.map(m => m.id) : [];
        for (const memberID of utilArrayUnion(headMembers, baseMembers)) {
          const member = head.hasEntity(memberID);
          if (!member) continue;   // not downloaded
          result.set(memberID, member);
        }
      }

      _addParents(head.parentWays(entity), result);
      _addParents(head.parentRelations(entity), result);
    }

    return result;


    function _addParents(parents) {
      for (const parent of parents) {
        if (result.has(parent.id)) continue;
        result.set(parent.id, parent);
        _addParents(head.parentRelations(parent));  // recurse up to parent relations
      }
    }
  }

}
