import { utilArrayDifference } from '@rapid-sdk/util';


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

    // A Graph derived from a predecessor Graph
    if (other instanceof Graph) {
      this._base = other._base;      // Base data is shared among the chain of Graphs
      this._local = {                // Local data is a clone of the predecessor data
        entities: new Map(other._local.entities),       // shallow clone
        parentWays: new Map(other._local.parentWays),   // shallow clone
        parentRels: new Map(other._local.parentRels)    // shallow clone
      };

     // A fresh Graph
     } else {
      this._base = {
        entities: new Map(),      // Map(entityID -> Entity)
        parentWays: new Map(),    // Map(entityID -> Set(entityIDs))
        parentRels: new Map()     // Map(entityID -> Set(entityIDs))
      };
      this._local = {
        entities: new Map(),      // Map(entityID -> Entity)
        parentWays: new Map(),    // Map(entityID -> Set(entityIDs))
        parentRels: new Map()     // Map(entityID -> Set(entityIDs))
      };

      this.rebase(other || [], [this]);   // seed with Entities, if provided
    }

    this._transients = new Map();     // Map(entityID -> Map(k -> v))
    this._childNodes = new Map();
    this._frozen = !mutable;
  }


  /**
   * base
   * @readonly
   */
  get base() {
    return this._base;
  }

  /**
   * local
   * @readonly
   */
  get local() {
    return this._local;
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
   * Gets an Entity, searches the local graph first, then the base graph.
   * @param   entityID  The entityID to lookup
   * @return  Entity from either local or base graph, or `undefined` if not found.
   */
  hasEntity(entityID) {
    const base = this._base.entities;
    const local = this._local.entities;
    return local.has(entityID) ? local.get(entityID) : base.get(entityID);
  }


  /**
   * entity
   * Gets an Entity, searches the local graph first, then the base graph.
   * (same as `hasEntity` but throws if not found)
   * @param   entityID  The entityID to lookup
   * @return  Entity from either local or base graph
   * @throws  Will throw if the entity is not found
   */
  entity(entityID) {
    const entity = this.hasEntity(entityID);
    if (!entity) {
      throw new Error(`Entity ${entityID} not found`);
    }
    return entity;
  }


  /**
   * geometry
   * Returns the geometry of the given entityID.
   * @param   entityID  The entityID to lookup
   * @return  String geometry of that entity (e.g. 'point', 'vertex', 'line', 'area')
   * @throws  Will throw if the entity is not found
   */
  geometry(entityID) {
    return this.entity(entityID).geometry(this);
  }


  /**
   * transient
   * Stores a computed property for the given Entity in the graph itself,
   * to avoid frequent and expensive recomputation.  We're essentially
   * implementating "memoization" for the provided function.
   * @param   entity   The Entity to compute a value for
   * @param   key      String cache key to lookup the computed value (e.g. 'extent')
   * @param   fn       Function that performs the computation, will be passed `entity`
   * @return  The result of the function call
   */
  transient(entity, key, fn) {
    const entityID = entity.id;
    let cache = this._transients.get(entityID);
    if (!cache) {
      cache = new Map();
      this._transients.set(entityID, cache);
    }

    let val = cache.get(key);
    if (val !== undefined) return val;  // return cached

    val = fn.call(entity);   // compute value
    cache.set(key, val);
    return val;
  }


  /**
   * isPoi
   * Returns `true` if the Entity is a Node with no parents
   * @param   entity
   * @return  `true` if a Node with no parents
   */
  isPoi(entity) {
    if (entity.type !== 'node') return false;

    const base = this._base.parentWays;
    const local = this._local.parentWays;
    const parentIDs = local.get(entity.id) ?? base.get(entity.id) ?? new Set();
    return parentIDs.size === 0;
  }


  /**
   * isShared
   * Returns `true` if the Entity has multiple connections:
   *  - a Node with multiple parents, OR
   *  - a Node connected to a single parent in multiple places.
   * @param   entity
   * @return  `true` if a Node has multiple connections
   */
  isShared(entity) {
    if (entity.type !== 'node') return false;

    const base = this._base.parentWays;
    const local = this._local.parentWays;
    const parentIDs = local.get(entity.id) ?? base.get(entity.id) ?? new Set();
    if (parentIDs.size === 0) return false;  // no parents
    if (parentIDs.size > 1) return true;     // multiple parents

    // single parent
    const parentID = [...parentIDs][0];
    const parent = this.entity(parentID);

    // If parent is a closed loop, don't count the last node in the nodelist as doubly connected
    const end = parent.isClosed() ? parent.nodes.length - 1 : parent.nodes.length;
    for (let i = 0, count = 0; i < end; i++) {
      if (entity.id === parent.nodes[i]) count++;
      if (count > 1) return true;
    }
    return false;
  }


  /**
   * parentWays
   * Makes an Array containing parent Ways for the given Entity.
   * Makes a shallow copy (i.e. the Array is new, but the Entities in it are references)
   * @param   entity
   * @return  Array of parent Ways
   * @throws  Will throw if any parent Way is not found
   */
  parentWays(entity) {
    const base = this._base.parentWays;
    const local = this._local.parentWays;
    const parentIDs = local.get(entity.id) ?? base.get(entity.id) ?? new Set();
    return Array.from(parentIDs).map(parentID => this.entity(parentID));
  }


  /**
   * parentRelations
   * Makes an Array containing parent Relations for the given Entity.
   * Makes a shallow copy (i.e. the Array is new, but the Entities in it are references)
   * @param   entity
   * @return  Array of parent Relations
   * @throws  Will throw if any parent Relation is not found
   */
  parentRelations(entity) {
    const base = this._base.parentRels;
    const local = this._local.parentRels;
    const parentIDs = local.get(entity.id) ?? base.get(entity.id) ?? new Set();
    return Array.from(parentIDs).map(parentID => this.entity(parentID));
  }


  /**
   * parentMultipolygons
   * Same as parentRelations, but filtered for multipolygons.
   * @param   entity
   * @return  Array of parent Relations that are multipolygons
   * @throws  Will throw if any parent Relation is not found
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
   * @throws  Will throw if any parent Relation is not found
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
  }


  /**
   * rebase
   * Rebase merges new Entities into the base graph.
   * Unlike other Graph methods that return a new Graph, rebase mutates in place.
   * This is because it is used during to merge newly downloaded data into an existing stack of edits.
   * To external consumers of the Graph, it should appear as if the Graph always contained the newly downloaded data.
   * @param  entities  Entities to add to the base Graph
   * @param  stack     Stack of graphs that need updates after this rebase
   * @param  force     If `true`, always update, if `false` skip entities that we've seen already
   */
  rebase(entities, stack, force) {
    const base = this._base;
    const head = stack[stack.length - 1]._local.entities;
    const restoreIDs = new Set();

    for (const entity of entities) {
      if (!entity.visible || (!force && base.entities.has(entity.id))) continue;

      // Merge data into the base graph
      base.entities.set(entity.id, entity);
      this._updateCalculated(undefined, entity, base.parentWays, base.parentRels);

      // A weird thing we have to watch out for..
      // Sometimes an edit can remove a node, then we download more information and realize
      // that that Node belonged to a parentWay.  If we detect this condition, restore the node.
      // (A "delete" is stored as: setting that entity = `undefined`)
      if (entity.type === 'way') {
        for (const id of entity.nodes) {
          if (head.has(id) && head.get(id) === undefined) {  // was deleted
            restoreIDs.add(id);
          }
        }
      }
    }

    for (const graph of stack) {
      const local = graph._local.entities;
      // Restore deleted nodes that were discovered to belong to a parentWay.
      for (const id of restoreIDs) {
        if (local.has(id) && local.get(id) === undefined) {  // was deleted
          local.delete(id);
        }
      }
      graph._updateRebased();
    }
  }


  /**
   * _updateRebased
   * Internal function - Update a graph following a `rebase` (base graph has changed).
   * Check local `parentWays` and `parentRels` caches and make sure they
   * are consistent with the data in the base caches.
   */
  _updateRebased() {
    const base = this._base;
    const local = this._local;

    for (const [childID, parentWayIDs] of local.parentWays) {  // for all this.parentWays we've cached
      const baseWayIDs = base.parentWays.get(childID);         // compare to base.parentWays
      if (!baseWayIDs) continue;
      for (const wayID of baseWayIDs) {
        if (!local.entities.has(wayID)) {  // if the Way hasn't been edited
          parentWayIDs.add(wayID);        // update `this.parentWays` cache
        }
      }
    }

    for (const [childID, parentRelIDs] of local.parentRels) {  // for all this.parentRels we've cached
      const baseRelIDs = base.parentRels.get(childID);         // compare to base.parentRels
      if (!baseRelIDs) continue;
      for (const relID of baseRelIDs) {
        if (!local.entities.has(relID)) {  // if the Relation hasn't been edited
          parentRelIDs.add(relID);        // update `this.parentRels` cache
        }
      }
    }

    this._transients = new Map();

    // this._childNodes is not updated, under the assumption that
    // ways are always downloaded with their child nodes.
  }


  /**
   * _updateCalculated
   * Internal function, used to update parentWays and parentRels caches
   * based on an entity update
   * @param  previous?     The previous Entity
   * @param  current?      The current Entity
   * @param  parentWays?   parentWays Map() to update (defaults to `this._local.parentWays`)
   * @param  parentRels?   parentRels Map() to update (defaults to `this._local.parentRels`)
   */
  _updateCalculated(previous, current, parentWays, parentRels) {
    const base = this._base;
    const local = this._local;
    parentWays = parentWays || local.parentWays;
    parentRels = parentRels || local.parentRels;

    const entity = current ?? previous;
    if (!entity) return;   // Either current or previous must be set

    let removed, added;

    if (entity.type === 'way') {  // Update parentWays
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
        const parentIDs = new Set( local.parentWays.get(childID) ?? base.parentWays.get(childID) ?? [] );
        parentIDs.delete(entity.id);
        parentWays.set(childID, parentIDs);
      }
      for (const childID of added) {
        const parentIDs = new Set( local.parentWays.get(childID) ?? base.parentWays.get(childID) ?? [] );
        parentIDs.add(entity.id);
        parentWays.set(childID, parentIDs);
      }

    } else if (entity.type === 'relation') {   // Update parentRels
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
        const parentIDs = new Set( local.parentRels.get(childID) ?? base.parentRels.get(childID) ?? [] );
        parentIDs.delete(entity.id);
        parentRels.set(childID, parentIDs);
      }
      for (const childID of added) {
        const parentIDs = new Set( local.parentRels.get(childID) ?? base.parentRels.get(childID) ?? [] );
        parentIDs.add(entity.id);
        parentRels.set(childID, parentIDs);
      }
    }
  }


  /**
   * replace
   * Replace an Entity in this Graph
   * @param   entity  The Entity to replace
   * @return  A new Graph
   */
  replace(replacement) {
    const entityID = replacement.id;
    const current = this.hasEntity(entityID);
    if (current === replacement) return this;  // no change

    return this.update(function() {
      this._updateCalculated(current, replacement);
      this._local.entities.set(entityID, replacement);
    });
  }


  /**
   * remove
   * Remove an Entity from this Graph
   * @param   entity  The Entity to remove
   * @return  A new Graph
   */
  remove(entity) {
    const entityID = entity.id;
    const current = this.hasEntity(entityID);
    if (!current) return this;  // not in the graph

    return this.update(function() {
      this._updateCalculated(current, undefined);
      this._local.entities.set(entityID, undefined);
    });
  }


  /**
   * revert
   * Revert an Entity back to whatver state it had in the base graph
   * @param   entityID   The entityID of the Entity to revert
   * @return  A new Graph
   */
  revert(entityID) {
    const original = this._base.entities.get(entityID);
    const current = this.hasEntity(entityID);
    if (current === original) return this;   // no change

    return this.update(function() {
      this._updateCalculated(current, original);
      this._local.entities.delete(entityID);
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
   * Loads new Entities into the local Graph, obliterating any existing Entities.
   * Used when restoring history or entering/leaving walkthrough.
   * @param   entities   `Object (entityID -> Entity)`
   * @return  this Graph
   */
  load(entities) {
    const base = this._base;
    const local = this._local;
    local.entities = new Map();

    for (const [entityID, entity] of Object.entries(entities)) {
      const original = base.entities.get(entityID);   // likely undefined, but may as well check
      local.entities.set(entityID, entity);
      this._updateCalculated(original, entity);
    }

    return this;
  }

}
