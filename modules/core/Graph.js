import { utilArrayDifference } from '@id-sdk/util';
import { debug } from '../index';


/**
 *  Graph
 */
export class Graph {

  /**
   * @constructor
   * @param  other?    Optional other Graph to derive from or Array of nodes
   * @param  mutable?  Do updates affect this Graph or return a new Graph
   */
  constructor(other, mutable) {
    if (other instanceof Graph) {
      this._base = other._base;
      this.entities = new Map(other.entities);       // shallow clone
      this._parentWays = new Map(other._parentWays);   // shallow clone
      this._parentRels = new Map(other._parentRels);   // shallow clone
//      var base = other.base();
//      this.entities = Object.assign(Object.create(base.entities), other.entities);
//      this._parentWays = Object.assign(Object.create(base._parentWays), other._parentWays);
//      this._parentRels = Object.assign(Object.create(base._parentRels), other._parentRels);

    } else {
      this._base = {
        entities: new Map(),       // Map(entityID -> Entity)
        _parentWays: new Map(),     // Map(entityID -> Set(entityIDs))
        _parentRels: new Map()      // Map(entityID -> Set(entityIDs))
      };
      this.entities = new Map();       // Map(entityID -> Entity)
      this._parentWays = new Map();     // Map(entityID -> Set(entityIDs))
      this._parentRels = new Map();     // Map(entityID -> Set(entityIDs))

//      this.entities = Object.create({});
//      this._parentWays = Object.create({});
//      this._parentRels = Object.create({});
      this.rebase(other || [], [this]);
    }

    this._transients = new Map();     // Map(entityID -> Map(k -> v))
    this._childNodes = new Map();

//    this._transients = {};
//    this._childNodes = {};
    this._frozen = !mutable;
  }


  /**
   * base
   */
  base() {
    return this._base;
//    return {
//      'entities': Object.getPrototypeOf(this.entities),
//      'parentWays': Object.getPrototypeOf(this._parentWays),
//      'parentRels': Object.getPrototypeOf(this._parentRels)
//    };
  }


  /**
   * frozen
   * @readonly
   */
  get frozen() {
    return this._frozen;
  }


  /**
   * hasEntity
   * @param  id
   */
  hasEntity(id) {
//    return this.entities[id];
    return this.entities.has(id) ? this.entities.get(id) : this._base.entities.get(id);
  }


  /**
   * entity
   * @param  id
   */
  entity(id) {
//    const entity = this.entities[id];
    const entity = this.hasEntity(id);
    if (!entity) {
      throw new Error(`Entity ${id} not found`);
    }
    return entity;
  }


  /**
   * geometry
   * @param  id
   */
  geometry(id) {
    return this.entity(id).geometry(this);
  }


  /**
   * transient
   * Stores a computed property for the given Entity in the graph itself,
   * to avoid frequent and expensive recomputation.  We're essentially
   * implementating "memoization" for the provided function.
   * @param  entity
   * @param  key
   * @param  fn
   */
  transient(entity, key, fn) {
    const id = entity.id;
    let cache = this._transients.get(id);
    if (!cache) {
      cache = new Map();
      this._transients.set(id, cache);
    }

    let val = cache.get(key);
    if (val !== undefined) return val;  // return cached

    val = fn.call(entity);   // compute value
    cache.set(key, val);
    return val;

//    const id = entity.id;
//    const transients = this._transients[id] || (this._transients[id] = {});
//
//    if (transients[key] !== undefined) {
//      return transients[key];
//    }
//
//    transients[key] = fn.call(entity);
//    return transients[key];
  }


  /**
   * isPoi
   * @param   entity
   * @return  `true` if no parents
   */
  isPoi(entity) {
    const parentIDs = this._parentWays.get(entity.id) ?? this._base._parentWays.get(entity.id) ?? new Set();
    return parentIDs.size === 0;
//    const parents = this._parentWays[entity.id];
//    return !parents || parents.size === 0;
  }


  /**
   * isShared
   * @param   entity
   * @return  `true` if >1 parents
   */
  isShared(entity) {
    const parentIDs = this._parentWays.get(entity.id) ?? this._base._parentWays.get(entity.id) ?? new Set();
    return parentIDs.size  > 1;
//    const parents = this._parentWays[entity.id];
//    return parents && parents.size > 1;
  }


  /**
   * parentWays
   * Makes an Array containing parent Ways for the given Entity.
   * Makes a shallow copy (i.e. the Array is new, but the Entities in it are references)
   * @param   entity
   * @return  Array of parent Ways
   */
  parentWays(entity) {
    const parentIDs = this._parentWays.get(entity.id) ?? this._base._parentWays.get(entity.id) ?? new Set();
    return Array.from(parentIDs).map(parentID => this.entity(parentID));
//    const parents = this._parentWays[entity.id];
//    let result = [];
//    if (parents) {
//      parents.forEach(function(id) { result.push(this.entity(id)); }, this);
//    }
//    return result;
  }


  /**
   * parentRelations
   * Makes an Array containing parent Relations for the given Entity.
   * Makes a shallow copy (i.e. the Array is new, but the Entities in it are references)
   * @param  entity
   * @return  Array of parent Relations
   */
  parentRelations(entity) {
    const parentIDs = this._parentRels.get(entity.id) ?? this._base._parentRels.get(entity.id) ?? new Set();
    return Array.from(parentIDs).map(parentID => this.entity(parentID));
//    const parents = this._parentRels[entity.id];
//    let result = [];
//    if (parents) {
//      parents.forEach(function(id) { result.push(this.entity(id)); }, this);
//    }
//    return result;
  }


  /**
   * parentMultipolygons
   * @param  entity
   */
  parentMultipolygons(entity) {
    return this.parentRelations(entity).filter(relation => relation.isMultipolygon());
  }


  /**
   * childNodes
   * Makes an Array containing child Nodes for the given Entity.
   * This function is memoized, so that repeated calls return the same Array.
   * @param   entity
   * @return  Array of child Nodes
   */
  childNodes(entity) {
    if (!entity.nodes) return [];  // not a way?

    let children = this._childNodes.get(entity.id);
    if (children) return children;  // return cached

    // compute
    children = new Array(entity.nodes.length);
    for (let i = 0; i < entity.nodes.length; ++i) {
      children[i] = this.entity(entity.nodes[i]);
    }
    this._childNodes.set(entity.id, children);  // set cache
    return children;

//    if (this._childNodes[entity.id]) return this._childNodes[entity.id];
//    if (!entity.nodes) return [];
//
//    var nodes = [];
//    for (var i = 0; i < entity.nodes.length; i++) {
//        nodes[i] = this.entity(entity.nodes[i]);
//    }
//
//    if (debug) Object.freeze(nodes);
//
//    this._childNodes[entity.id] = nodes;
//    return this._childNodes[entity.id];
  }


  /**
   * rebase
   * Unlike other graph methods, rebase mutates in place. This is because it
   * is used only during the history operation that merges newly downloaded
   * data into each state. To external consumers, it should appear as if the
   * Graph always contained the newly downloaded data.
   * @param  entities
   * @param  stack
   * @param  force
   */
  rebase(entities, stack, force) {
    const base = this._base;
    const head = stack[stack.length - 1];
    const restoreIDs = new Set();

    for (const entity of entities) {
      if (!entity.visible || (!force && base.entities.has(entity.id))) continue;

      // Merge data into the base graph
      base.entities.set(entity.id, entity);
      this._updateCalculated(undefined, entity, base._parentWays, base._parentRels);

      // A weird thing we have to watch out for..
      // Sometimes an edit can remove a node, then we download more information and realize
      // that that Node belonged to a parentWay.  If we detect this condition, restore the node.
      // (A "delete" is stored as: setting that entity = `undefined`)
      if (entity.type === 'way') {
        for (const id of entity.nodes) {
          if (head.entities.has(id) && (head.entities.get(id) === undefined)) {  // was deleted
            restoreIDs.add(id);
          }
        }
      }
    }

    for (const graph of stack) {
      // Restore deleted nodes that were discovered to belong to a parentWay.
      for (const id of restoreIDs) {
        if (graph.entities.has(id) && (graph.entities.get(id) === undefined)) {  // was deleted
          graph.entities.delete(id);
        }
      }
      graph._updateRebased();
    }
  }


  /**
   * _updateRebased
   */
  _updateRebased() {
    const base = this._base;

    for (const [childID, parentWayIDs] of this._parentWays) {  // for all this.parentWays we've cached
      const baseWayIDs = base._parentWays.get(childID);        // compare to base._parentWays
      if (!baseWayIDs) continue;
      for (const wayID of baseWayIDs) {
        if (!this.entities.has(wayID)) {  // if the Way hasn't been edited
          parentWayIDs.add(wayID);        // update `this.parentWays` cache
        }
      }
    }

    // Object.keys(this._parentWays).forEach(function(childID) {
    //   if (base._parentWays[childID]) {
    //     base._parentWays[childID].forEach(function(id) {
    //       if (!this.entities.hasOwnProperty(id)) {
    //         this._parentWays[childID].add(id);
    //       }
    //     }, this);
    //   }
    // }, this);

    for (const [childID, parentRelIDs] of this._parentRels) {  // for all this.parentRels we've cached
      const baseRelIDs = base._parentRels.get(childID);        // compare to base._parentRels
      if (!baseRelIDs) continue;
      for (const relID of baseRelIDs) {
        if (!this.entities.has(relID)) {  // if the Relation hasn't been edited
          parentRelIDs.add(relID);        // update `this.parentRels` cache
        }
      }
    }

    // Object.keys(this._parentRels).forEach(function(childID) {
    //   if (base._parentRels[childID]) {
    //     base._parentRels[childID].forEach(function(id) {
    //       if (!this.entities.hasOwnProperty(id)) {
    //         this._parentRels[childID].add(id);
    //       }
    //     }, this);
    //   }
    // }, this);

    this._transients = new Map();

    // this._childNodes is not updated, under the assumption that
    // ways are always downloaded with their child nodes.
  }


  /**
   * _updateCalculated
   * Updates calculated properties (parentWays, parentRels) for the specified change
   * @param  previous?     The previous Entity
   * @param  current?      The current Entity
   * @param  parentWays?   parentWays Map() to update (defaults to `this._parentWays`)
   * @param  parentRels?   parentRels Map() to update (defaults to `this._parentRels`)
   */
    _updateCalculated(previous, current, parentWays, parentRels) {
      parentWays = parentWays || this._parentWays;
      parentRels = parentRels || this._parentRels;

      const entity = current ?? previous;
      if (!entity) return;   // Either current or previous must be set

      let removed, added;

// todo: experiment
// When changing a node, update the internal verisons of its parentways so that they update too.
// This code might be the wrong thing, or might belong in difference.js
// Need to consider undo/redo also
if (entity.type === 'node' && parentWays === this._parentWays) {
  const parents = this.parentWays(entity);
  for (const parent of parents) {
    parent.v = (parent.v || 0) + 1;   // very hacky - bump version in place
  }
}

    if (entity.type === 'way') {  // Update _parentWays
      if (previous && current) {  // Way Modified
        removed = utilArrayDifference(previous.nodes, current.nodes);
        added = utilArrayDifference(current.nodes, previous.nodes);
      } else if (previous) {      // Way Deleted
        removed = previous.nodes;
        added = [];
      } else if (current) {       // Way Added
        removed = [];
        added = current.nodes;
      }

      // shallow copy whatever parentWays had in it before, and perform deletes/adds as needed
      for (const childID of removed) {
        const parentIDs = new Set( this._parentWays.get(childID) ?? this._base._parentWays.get(childID) ?? [] );
        parentIDs.delete(entity.id);
        parentWays.set(childID, parentIDs);
      }
      for (const childID of added) {
        const parentIDs = new Set( this._parentWays.get(childID) ?? this._base._parentWays.get(childID) ?? [] );
        parentIDs.add(entity.id);
        parentWays.set(childID, parentIDs);
      }

    } else if (entity.type === 'relation') {   // Update _parentRels
      // diff only on the IDs since the same entity can be a member multiple times with different roles
      const previousMemberIDs = previous ? previous.members.map(m => m.id) : [];
      const currentMemberIDs = current ? current.members.map(m => m.id) : [];

      if (previous && current) {   // Relation Modified
        removed = utilArrayDifference(previousMemberIDs, currentMemberIDs);
        added = utilArrayDifference(currentMemberIDs, previousMemberIDs);
      } else if (previous) {       // Relation Deleted
        removed = previousMemberIDs;
        added = [];
      } else if (current) {        // Relation Added
        removed = [];
        added = currentMemberIDs;
      }

      // shallow copy whatever parentRels had in it before, and perform deletes/adds as needed
      for (const childID of removed) {
        const parentIDs = new Set( this._parentRels.get(childID) ?? this._base._parentRels.get(childID) ?? [] );
        parentIDs.delete(entity.id);
        parentRels.set(childID, parentIDs);
      }
      for (const childID of added) {
        const parentIDs = new Set( this._parentRels.get(childID) ?? this._base._parentRels.get(childID) ?? [] );
        parentIDs.add(entity.id);
        parentRels.set(childID, parentIDs);
      }
    }
  }


  /**
   * replace
   * Replace an Entity in this Graph
   * @param   entity
   * @return  A new Graph
   */
  replace(replacement) {
    const entityID = replacement.id;
    const current = this.hasEntity(entityID);
    if (current === replacement) return this;  // no change

    return this.update(function() {
      this._updateCalculated(current, replacement);
      this.entities.set(entityID, replacement);
    });
  }


  /**
   * remove
   * Remove an Entity from this Graph
   * @param   entity
   * @return  A new Graph
   */
  remove(entity) {
    const entityID = entity.id;
    const current = this.hasEntity(entityID);
    if (!current) return this;  // not in the graph

    return this.update(function() {
      this._updateCalculated(current, undefined);
      this.entities.set(entityID, undefined);
    });
  }


  /**
   * revert
   * Revert an Entity back to whatver state it had in the base graph
   * @param   entityID
   * @return  A new Graph
   */
  revert(entityID) {
    const original = this._base.entities.get(entityID);
    const current = this.hasEntity(entityID);
    if (current === original) return this;   // no change

    return this.update(function() {
      this._updateCalculated(current, original);
      this.entities.delete(entityID);
    });
  }


  /**
   * update
   * Applies the given list of function arguments to the Graph, and returns a new Graph
   * @param   {...function} args  Functions to apply to the graph to update it
   * @return  A new Graph
   */
  update(...args) {
    const graph = this._frozen ? new Graph(this, true) : this;

    for (const fn of args) {
      fn.call(graph, graph);
    }

    if (this._frozen) {
      graph._frozen = true;
    }

    return graph;
  }


  /**
   * load
   * Loads new entities into the Graph, obliterating any existing Entities.
   * Used when restoring history or entering/leaving walkthrough.
   * @param   entities `Object (entityID -> Entity)`
   * @return  this Graph
   */
  load(entities) {
    this.entities = new Map();

    for (const [entityID, entity] of Object.entries(entities)) {
      const original = this._base.entities.get(entityID);   // likely undefined, but may as well check
      this.entities.set(entityID, entity);
      this._updateCalculated(original, entity);
    }
    return this;

//    var base = this.base();
//    this.entities = Object.create(base.entities);
//
//    for (var i in entities) {
//      this.entities[i] = entities[i];
//      this._updateCalculated(base.entities[i], this.entities[i]);
//    }
//
//    return this;
  }

}
