import { utilArrayDifference } from '@id-sdk/util';
import { debug } from '../index';


/**
 *  Graph
 */
export class Graph {

  /**
   * @constructor
   * @param  other?    Optional other graph to copy from
   * @param  mutable?  Do updates affect this Graph or return a new Graph
   */
  constructor(other, mutable) {
    if (other instanceof Graph) {
      var base = other.base();
      this.entities = Object.assign(Object.create(base.entities), other.entities);
      this._parentWays = Object.assign(Object.create(base.parentWays), other._parentWays);
      this._parentRels = Object.assign(Object.create(base.parentRels), other._parentRels);

    } else {
      this.entities = Object.create({});
      this._parentWays = Object.create({});
      this._parentRels = Object.create({});
      this.rebase(other || [], [this]);
    }

    this.transients = {};
    this._childNodes = {};
    this._frozen = !mutable;
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
    return this.entities[id];
  }


  /**
   * entity
   * @param  id
   */
  entity(id) {
    const entity = this.entities[id];
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
   * @param  entity
   * @param  key
   * @param  fn
   */
  transient(entity, key, fn) {
    const id = entity.id;
    const transients = this.transients[id] || (this.transients[id] = {});

    if (transients[key] !== undefined) {
      return transients[key];
    }

    transients[key] = fn.call(entity);
    return transients[key];
  }


  /**
   * parentWays
   * @param  entity
   */
  parentWays(entity) {
    const parents = this._parentWays[entity.id];
    let result = [];
    if (parents) {
      parents.forEach(function(id) { result.push(this.entity(id)); }, this);
    }
    return result;
  }


  /**
   * isPoi
   * @param  entity
   */
  isPoi(entity) {
    const parents = this._parentWays[entity.id];
    return !parents || parents.size === 0;
  }


  /**
   * isShared
   * @param  entity
   */
  isShared(entity) {
    const parents = this._parentWays[entity.id];
    return parents && parents.size > 1;
  }


  /**
   * parentRelations
   * @param  entity
   */
  parentRelations(entity) {
    const parents = this._parentRels[entity.id];
    let result = [];
    if (parents) {
      parents.forEach(function(id) { result.push(this.entity(id)); }, this);
    }
    return result;
  }


  /**
   * parentMultipolygons
   * @param  entity
   */
  parentMultipolygons(entity) {
    return this.parentRelations(entity)
      .filter(function(relation) { return relation.isMultipolygon(); });
  }


  /**
   * childNodes
   * @param  entity
   */
  childNodes(entity) {
    if (this._childNodes[entity.id]) return this._childNodes[entity.id];
    if (!entity.nodes) return [];

    var nodes = [];
    for (var i = 0; i < entity.nodes.length; i++) {
        nodes[i] = this.entity(entity.nodes[i]);
    }

    if (debug) Object.freeze(nodes);

    this._childNodes[entity.id] = nodes;
    return this._childNodes[entity.id];
  }


  /**
   * base
   */
  base() {
    return {
      'entities': Object.getPrototypeOf(this.entities),
      'parentWays': Object.getPrototypeOf(this._parentWays),
      'parentRels': Object.getPrototypeOf(this._parentRels)
    };
  }


  /**
   * rebase
   * Unlike other graph methods, rebase mutates in place. This is because it
   * is used only during the history operation that merges newly downloaded
   * data into each state. To external consumers, it should appear as if the
   * graph always contained the newly downloaded data.
   * @param  entities
   * @param  stack
   * @param  force
   */
  rebase(entities, stack, force) {
    var base = this.base();
    var i, j, k, id;

    for (i = 0; i < entities.length; i++) {
      var entity = entities[i];

      if (!entity.visible || (!force && base.entities[entity.id])) continue;

      // Merging data into the base graph
      base.entities[entity.id] = entity;
      this._updateCalculated(undefined, entity, base.parentWays, base.parentRels);

      // Restore provisionally-deleted nodes that are discovered to have an extant parent
      if (entity.type === 'way') {
        for (j = 0; j < entity.nodes.length; j++) {
          id = entity.nodes[j];
          for (k = 1; k < stack.length; k++) {
            var ents = stack[k].entities;
            if (ents.hasOwnProperty(id) && ents[id] === undefined) {
              delete ents[id];
            }
          }
        }
      }
    }

    for (i = 0; i < stack.length; i++) {
      stack[i]._updateRebased();
    }
  }


  /**
   * _updateRebased
   */
  _updateRebased() {
    const base = this.base();

    Object.keys(this._parentWays).forEach(function(child) {
      if (base.parentWays[child]) {
        base.parentWays[child].forEach(function(id) {
          if (!this.entities.hasOwnProperty(id)) {
            this._parentWays[child].add(id);
          }
        }, this);
      }
    }, this);

    Object.keys(this._parentRels).forEach(function(child) {
      if (base.parentRels[child]) {
        base.parentRels[child].forEach(function(id) {
          if (!this.entities.hasOwnProperty(id)) {
            this._parentRels[child].add(id);
          }
        }, this);
      }
    }, this);

    this.transients = {};

    // this._childNodes is not updated, under the assumption that
    // ways are always downloaded with their child nodes.
  }


  /**
   * _updateCalculated
   * Updates calculated properties (parentWays, parentRels) for the specified change
   * @param  oldentity
   * @param  entity
   * @param  parentWays
   * @param  parentRels
   */
    _updateCalculated(oldentity, entity, parentWays, parentRels) {
      parentWays = parentWays || this._parentWays;
      parentRels = parentRels || this._parentRels;

      var type = entity && entity.type || oldentity && oldentity.type;
      var removed, added, i;

// todo: experiment
// When changing a node, update the internal verisons of its parentways so that they update too.
// This code might be the wrong thing , or might belong in difference.js
// Need to consider undo/redo also
if (type === 'node') {
  const nodeID = oldentity?.id ?? entity?.id;
  const parentIDs = parentWays[nodeID] || [];
  for (const parentID of parentIDs) {
      let parent = this.entities[parentID];
      parent.v = (parent.v || 0) + 1;   // bump version in place
  }
}

    if (type === 'way') {   // Update parentWays
      if (oldentity && entity) {
        removed = utilArrayDifference(oldentity.nodes, entity.nodes);
        added = utilArrayDifference(entity.nodes, oldentity.nodes);
      } else if (oldentity) {
        removed = oldentity.nodes;
        added = [];
      } else if (entity) {
        removed = [];
        added = entity.nodes;
      }
      for (i = 0; i < removed.length; i++) {
        // make a copy of prototype property, store as own property, and update..
        parentWays[removed[i]] = new Set(parentWays[removed[i]]);
        parentWays[removed[i]].delete(oldentity.id);
      }
      for (i = 0; i < added.length; i++) {
        // make a copy of prototype property, store as own property, and update..
        parentWays[added[i]] = new Set(parentWays[added[i]]);
        parentWays[added[i]].add(entity.id);
      }

    } else if (type === 'relation') {   // Update parentRels

      // diff only on the IDs since the same entity can be a member multiple times with different roles
      var oldentityMemberIDs = oldentity ? oldentity.members.map(function(m) { return m.id; }) : [];
      var entityMemberIDs = entity ? entity.members.map(function(m) { return m.id; }) : [];

      if (oldentity && entity) {
        removed = utilArrayDifference(oldentityMemberIDs, entityMemberIDs);
        added = utilArrayDifference(entityMemberIDs, oldentityMemberIDs);
      } else if (oldentity) {
        removed = oldentityMemberIDs;
        added = [];
      } else if (entity) {
        removed = [];
        added = entityMemberIDs;
      }
      for (i = 0; i < removed.length; i++) {
        // make a copy of prototype property, store as own property, and update..
        parentRels[removed[i]] = new Set(parentRels[removed[i]]);
        parentRels[removed[i]].delete(oldentity.id);
      }
      for (i = 0; i < added.length; i++) {
        // make a copy of prototype property, store as own property, and update..
        parentRels[added[i]] = new Set(parentRels[added[i]]);
        parentRels[added[i]].add(entity.id);
      }
    }
  }


  /**
   * replace
   * Replace an Entity in this Graph
   * @param   entity
   * @return  A new Graph
   */
  replace(entity) {
    if (this.entities[entity.id] === entity) return this;

    return this.update(function() {
      this._updateCalculated(this.entities[entity.id], entity);
      this.entities[entity.id] = entity;
    });
  }


  /**
   * remove
   * Remove an Entity from this Graph
   * @param   entity
   * @return  A new Graph
   */
  remove(entity) {
    return this.update(function() {
      this._updateCalculated(entity, undefined);
      this.entities[entity.id] = undefined;
    });
  }


  /**
   * revert
   * Revert an Entity back to whatver state it had in the base graph
   * @param   id
   * @return  A new Graph
   */
  revert(id) {
    var baseEntity = this.base().entities[id];
    var headEntity = this.entities[id];
    if (headEntity === baseEntity) return this;

    return this.update(function() {
      this._updateCalculated(headEntity, baseEntity);
      delete this.entities[id];
    });
  }


  /**
   * update
   * Applies the given list of function arguments to the Graph, and returns a new Graph
   * @param   arguments
   * @return  A new Graph
   */
  update() {
    const graph = this._frozen ? new Graph(this, true) : this;
    for (var i = 0; i < arguments.length; i++) {
        arguments[i].call(graph, graph);
    }

    if (this._frozen) {
      graph._frozen = true;
    }

    return graph;
  }


  /**
   * load
   * Loads new entities into the graph, obliterating any existing Entities.
   * @param   entities
   * @return  this Graph
   */
  load(entities) {
    var base = this.base();
    this.entities = Object.create(base.entities);

    for (var i in entities) {
      this.entities[i] = entities[i];
      this._updateCalculated(base.entities[i], this.entities[i]);
    }

    return this;
  }

}
