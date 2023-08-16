import { easeLinear as d3_easeLinear } from 'd3-ease';
import { select as d3_select } from 'd3-selection';
import { utilArrayDifference, utilArrayGroupBy, utilArrayUnion, utilObjectOmit, utilSessionMutex } from '@rapid-sdk/util';

import { AbstractSystem } from './AbstractSystem';
import { Difference, Graph, Tree } from './lib';
import { osmEntity } from '../osm/entity';
import { uiLoading } from '../ui/loading';


const DURATION = 150;


/**
 * `EditSystem` maintains the stack of user edits
 *  (it used to be called 'history')
 *
 * Events available:
 *   'change'
 *   'merge'
 *   'restore'
 *   'undone'
 *   'redone'
 *   'storage_error'
 */
export class EditSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'edits';   // was: 'history'
    this.dependencies = new Set(['storage', 'map', 'rapid']);

    this._mutex = utilSessionMutex('lock');
    this._hasRestorableChanges = false;

    this._imageryUsed = [];
    this._photosUsed = [];
    this._checkpoints = {};
    this._pausedGraph = false;
    this._stack = [];
    this._tree = null;
    this._index = 0;
    this._initPromise = null;

    // When called like `context.graph`, don't lose `this`
    this.graph = this.graph.bind(this);
    this.pauseChangeDispatch = this.pauseChangeDispatch.bind(this);
    this.resumeChangeDispatch = this.resumeChangeDispatch.bind(this);
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    if (this._initPromise) return this._initPromise;

    for (const id of this.dependencies) {
      if (!this.context.systems[id]) {
        return Promise.reject(`Cannot init:  ${this.id} requires ${id}`);
      }
    }

    this.reset();

    const storage = this.context.systems.storage;
    const prerequisites = storage.initAsync();

    return this._initPromise = prerequisites
      .then(() => {
        // changes are restorable if Rapid is not open in another window/tab and a saved history exists in localStorage
        this._hasRestorableChanges = this._mutex.lock() && storage.hasItem(this._historyKey());
      });
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    this._started = true;
    return Promise.resolve();
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    this.reset();
    return Promise.resolve();
  }


  /**
   * reset
   * Called after completing an edit session to reset any internal state
   */
  reset() {
    d3_select(document).interrupt('editTransition');
    const base = new Graph();
    this._stack = [{ graph: base }];
    this._tree = new Tree(base);
    this._index = 0;
    this._checkpoints = {};
  }


  graph() {
    return this._stack[this._index].graph;
  }


  tree() {
    return this._tree;
  }


  base() {
    return this._stack[0].graph;
  }


  peekAnnotation() {
    return this._stack[this._index].annotation;
  }

  peekAllAnnotations() {
    let result = [];
    for (let i = 0; i <= this._index; i++) {
      if (this._stack[i].annotation) {
        result.push(this._stack[i].annotation);
      }
    }
    return result;
  }


  /**
   *  merge
   *  Merge new entities into the history.  This function is called
   *  when we have parsed a new tile of OSM data, we will receive the
   *  new entities and a list of all entity ids that the tile contains.
   *  Can also be called in other situations, like restoring history from
   *  storage, or loading specific entities from the OSM API.
   *
   *  @param  entities   Entities to merge into the history (usually only the new ones)
   *  @param  seenIDs?   Optional - All entity IDs on the tile (including previously seen ones)
   */
  merge(entities, seenIDs) {
    const baseGraph = this.base();
    const headGraph = this.graph();

    if (!(seenIDs instanceof Set)) {
      seenIDs = new Set(entities.map(entity => entity.id));
    }

    // Which ones are really new (not in the base graph)?
    const newIDs = new Set();
    for (const entity of entities) {
      if (!baseGraph.hasEntity(entity.id)) {  // not merged in yet.
        newIDs.add(entity.id);
      }
    }

    // If we are merging in new relation members, bump the relation's version.
    for (const id of seenIDs) {
      const entity = headGraph.hasEntity(id);
      if (entity?.type !== 'relation') continue;

      for (const member of entity.members) {
        if (newIDs.has(member.id)) {
          entity.touch();  // bump version in place
        }
      }
    }

    const graphs = this._stack.map(state => state.graph);
    baseGraph.rebase(entities, graphs, false);
    this._tree.rebase(entities, false);

    this.emit('merge', seenIDs);
  }


  perform(...args) {
    // complete any transition already in progress
    d3_select(document).interrupt('editTransition');

    // We can perform a eased edit in a transition if we have:
    // - a single action (or single action + annotation)
    // - and that action is 'transitionable' (i.e. accepts eased time parameter)
    const action0 = args[0];
    let transitionable = false;
    if (args.length === 1 || (args.length === 2 && typeof args[1] !== 'function')) {
      transitionable = !!action0.transitionable;
    }

    if (transitionable) {
      d3_select(document)
        .transition('editTransition')
        .duration(DURATION)
        .ease(d3_easeLinear)
        .tween('history.tween', () => {
          return (t) => {
            if (t < 1) this._overwrite([action0], t);
          };
        })
        .on('start', () => {
          this._perform([action0], 0);
        })
        .on('end interrupt', () => {
          this._overwrite(args, 1);
        });

    } else {
      return this._perform(args);
    }
  }


  replace(...args) {
    d3_select(document).interrupt('editTransition');
    return this._replace(args, 1);
  }


  // Same as calling pop and then perform
  overwrite(...args) {
    d3_select(document).interrupt('editTransition');
    return this._overwrite(args, 1);
  }


  pop(n) {
    d3_select(document).interrupt('editTransition');

    const previous = this._stack[this._index].graph;
    if (isNaN(+n) || +n < 0) {
      n = 1;
    }
    while (n-- > 0 && this._index > 0) {
      this._index--;
      this._stack.pop();
    }
    return this._change(previous);
  }


  // Go back to the previous annotated edit or _index = 0.
  undo() {
    d3_select(document).interrupt('editTransition');

    const previousEdit = this._stack[this._index];
    while (this._index > 0) {
      this._index--;
      if (this._stack[this._index].annotation) break;
    }

    this.emit('undone', this._stack[this._index], previousEdit);
    return this._change(previousEdit.graph);
  }


  // Go forward to the next annotated state.
  redo() {
    d3_select(document).interrupt('editTransition');

    const previousEdit = this._stack[this._index];

    let tryIndex = this._index;
    while (tryIndex < this._stack.length - 1) {
      tryIndex++;
      if (this._stack[tryIndex].annotation) {
        this._index = tryIndex;
        this.emit('redone', this._stack[this._index], previousEdit);
        break;
      }
    }

    return this._change(previousEdit.graph);
  }


  pauseChangeDispatch() {
    if (!this._pausedGraph) {
      this._pausedGraph = this._stack[this._index].graph;
    }
  }


  resumeChangeDispatch() {
    if (this._pausedGraph) {
      const previous = this._pausedGraph;
      this._pausedGraph = null;
      return this._change(previous);
    }
  }


  undoAnnotation() {
    let i = this._index;
    while (i >= 0) {
      if (this._stack[i].annotation) return this._stack[i].annotation;
      i--;
    }
  }


  redoAnnotation() {
    let i = this._index + 1;
    while (i <= this._stack.length - 1) {
      if (this._stack[i].annotation) return this._stack[i].annotation;
      i++;
    }
  }


  // Returns the entities from the active graph with bounding boxes
  // overlapping the given `extent`.
  intersects(extent) {
    return this._tree.intersects(extent, this._stack[this._index].graph);
  }


  difference() {
    const base = this._stack[0].graph;
    const head = this._stack[this._index].graph;
    return new Difference(base, head);
  }


  changes(action) {
    const base = this._stack[0].graph;
    let head = this._stack[this._index].graph;

    if (action) {
      head = action(head);
    }

    const difference = new Difference(base, head);

    return {
      modified: difference.modified(),
      created: difference.created(),
      deleted: difference.deleted()
    };
  }


  hasChanges() {
    return this.difference().changes.size > 0;
  }


  imageryUsed(sources) {
    if (sources !== undefined) {
      this._imageryUsed = sources;
      return this;

    } else {
      let results = new Set();
      this._stack.slice(1, this._index + 1).forEach(function(edit) {
        for (const source of edit.imageryUsed ?? []) {
          if (source !== 'Custom') {
            results.add(source);
          }
        }
      });

      return Array.from(results);
    }
  }


  photosUsed(sources) {
    if (sources !== undefined) {
      this._photosUsed = sources;
      return this;

    } else {
      let results = new Set();
      this._stack.slice(1, this._index + 1).forEach(function(edit) {
        for (const source of edit.photosUsed ?? []) {
          results.add(source);
        }
      });

      return Array.from(results);
    }
  }


  // save the current history state
  setCheckpoint(key) {
    d3_select(document).interrupt('editTransition');

    this._checkpoints[key] = {
      stack: this._stack,
      index: this._index
    };
    return this;
  }


  // restore history state to a given checkpoint
  resetToCheckpoint(key) {
    d3_select(document).interrupt('editTransition');

    if (key !== undefined && this._checkpoints.hasOwnProperty(key)) {  // reset to given key
      const fromGraph = this._stack[this._index].graph;

      this._stack = this._checkpoints[key].stack;
      this._index = this._checkpoints[key].index;

      const toGraph = this._stack[this._index].graph;
      const difference = new Difference(fromGraph, toGraph);
      this.emit('change', difference);
    }
  }


  // `toIntroGraph()` is used to export the intro graph used by the walkthrough.
  //
  // To use it:
  //  1. Start the walkthrough.
  //  2. Get to a "free editing" tutorial step
  //  3. Make your edits to the walkthrough map
  //  4. In your browser dev console run:  `context.systems.edits.toIntroGraph()`
  //  5. This outputs stringified JSON to the browser console
  //  6. Copy it to `data/intro_graph.json` and prettify it in your code editor
  toIntroGraph() {
    let nextID = { n: 0, r: 0, w: 0 };
    let permIDs = {};
    let graph = this.graph();
    let result = new Map();   // Map(entityID -> Entity)

    // Copy base entities..
    for (const entity of graph.base.entities.values()) {
      const copy = _copyIntroEntity(entity);
      result.set(copy.id, copy);
    }

    // Replace base entities with head entities..
    for (const [entityID, entity] of graph.local.entities) {
      if (entity) {
        const copy = _copyIntroEntity(entity);
        result.set(copy.id, copy);
      } else {
        result.delete(entityID);
      }
    }

    // Swap ids in node and member lists..
    for (const entity of result.values()) {
      if (Array.isArray(entity.nodes)) {
        entity.nodes = entity.nodes.map(nodeID => {
          return permIDs[nodeID] ?? nodeID;
        });
      }
      if (Array.isArray(entity.members)) {
        entity.members = entity.members.map(member => {
          member.id = permIDs[member.id] || member.id;
          return member;
        });
      }
    }

    // Convert to Object so we can stringify it.
    let obj = {};
    for (const [k, v] of result) { obj[k] = v; }
    return JSON.stringify({ dataIntroGraph: obj });


    function _copyIntroEntity(entity) {
      let copy = utilObjectOmit(entity, ['type', 'user', 'v', 'version', 'visible']);

      // Note: the copy is no longer an osmEntity, so it might not have `tags`
      if (copy.tags && !Object.keys(copy.tags)) {
        delete copy.tags;
      }

      if (Array.isArray(copy.loc)) {
        copy.loc[0] = +copy.loc[0].toFixed(6);
        copy.loc[1] = +copy.loc[1].toFixed(6);
      }

      const match = entity.id.match(/([nrw])-\d*/);  // temporary id
      if (match !== null) {
        let nrw = match[1];
        let permID;
        do { permID = nrw + (++nextID[nrw]); }
        while (result.has(permID));

        permIDs[entity.id] = permID;
        copy.id = permID;
      }
      return copy;
    }

  }


  //
  //
  //
  toJSON() {
    if (!this.hasChanges()) return;

    const modifiedEntities = new Map();  // Map(Entity.key -> Entity)
    const allEntityIDs = new Set();
    const stackData = [];

    // Preserve the users stack of edits..
    for (const s of this._stack) {
      const currGraph = s.graph;   // edit done at this point in time
      let modified = [];
      let deleted = [];

      // watch out: for modified entities we index on "key" - e.g. "n1v1"
      for (const [entityID, entity] of currGraph.local.entities) {
        allEntityIDs.add(entityID);
        if (entity) {
          const key = osmEntity.key(entity);
          modifiedEntities.set(key, entity);
          modified.push(key);
        } else {
          deleted.push(entityID);
        }
      }

      const item = {};
      if (modified.length)  item.modified = modified;
      if (deleted.length)   item.deleted = deleted;
      if (s.imageryUsed)    item.imageryUsed = s.imageryUsed;
      if (s.photosUsed)     item.photosUsed = s.photosUsed;
      if (s.annotation)     item.annotation = s.annotation;
      if (s.transform)      item.transform = s.transform;
      if (s.selectedIDs)    item.selectedIDs = s.selectedIDs;
      stackData.push(item);
    }

    // Preserve the originals of edited Entities.
    // If user restores their edits, we need these Entities to look the same too.
    const baseGraph = this.base();   // The initial unedited graph
    let baseEntities = new Map();    // Map(entityID -> entity)

    for (const entityID of allEntityIDs) {
      const original = baseGraph.hasEntity(entityID);
      if (!original || baseEntities.has(entityID)) continue;

      baseEntities.set(entityID, original);

      // Preserve originals of child nodes
      for (const child of baseGraph.childNodes(original)) {
        baseEntities.set(child.id, child);
      }
      // Preserve originals of parent entities too
      for (const parent of baseGraph.parentWays(original)) {
        baseEntities.set(parent.id, parent);
      }
    }

    return JSON.stringify({
      version: 3,
      entities: [...modifiedEntities.values()],
      baseEntities: [...baseEntities.values()],
      stack: stackData,
      nextIDs: osmEntity.id.next,
      index: this._index,
      timestamp: (new Date()).getTime()
    });
  }


  //
  //
  //
  fromJSON(json, loadChildNodes) {
    const context = this.context;
    const rapidSystem = context.systems.rapid;
    const mapSystem = context.systems.map;

    const baseGraph = this.base();   // The initial unedited graph
    const hist = JSON.parse(json);
    let loadComplete = true;

    osmEntity.id.next = hist.nextIDs;
    this._index = hist.index;

    if (hist.version !== 2 && hist.version !== 3) {
      throw new Error(`History version ${hist.version} not supported.`);
    }

    // Instantiate the modified entities
    const modifiedEntities = new Map();  // Map(Entity.key -> Entity)
    for (const e of hist.entities) {
      modifiedEntities.set(osmEntity.key(e), osmEntity(e));
    }

    if (hist.version >= 3) {
      // If v3+, instantiate base entities too.
      const baseEntities = hist.baseEntities.map(e => osmEntity(e));

      // Merge originals into base graph, note that the force parameter is `true` here
      // to replace any that might have been loaded from the API.
      const graphs = this._stack.map(s => s.graph);
      baseGraph.rebase(baseEntities, graphs, true);
      this._tree.rebase(baseEntities, true);

      // When we restore a modified way, we also need to fetch any missing
      // childnodes that would normally have been downloaded with it.. iD#2142
      if (loadChildNodes) {
        const osm = context.services.osm;
        const baseWays = baseEntities.filter(entity => entity.type === 'way');
        const nodeIDs = baseWays.reduce(function(acc, way) { return utilArrayUnion(acc, way.nodes); }, []);
        let missing = nodeIDs.filter(nodeID => !baseGraph.hasEntity(nodeID));

        if (missing.length && osm) {
          loadComplete = false;
          mapSystem.redrawEnabled = false;

          const loading = uiLoading(context).blocking(true);
          context.container().call(loading);

          const _childNodesLoaded = function(err, result) {
            if (!err) {
              const visibleGroups = utilArrayGroupBy(result.data, 'visible');
              const visibles = visibleGroups.true || [];      // alive nodes
              const invisibles = visibleGroups.false || [];   // deleted nodes

              if (visibles.length) {
                const visibleIDs = visibles.map(entity => entity.id);
                const graphs = this._stack.map(s => s.graph);
                missing = utilArrayDifference(missing, visibleIDs);
                baseGraph.rebase(visibles, graphs, true);   // force = true
                this._tree.rebase(visibles, true);          // force = true
              }

              // fetch older versions of nodes that were deleted..
              invisibles.forEach(function(entity) {
                osm.loadEntityVersion(entity.id, +entity.version - 1, _childNodesLoaded);
              });
            }

            if (err || !missing.length) {
              loading.close();
              mapSystem.redrawEnabled = true;
              this.emit('change');
              this.emit('restore');
            }
          };

          osm.loadMultiple(missing, _childNodesLoaded);
        }
      }
    }   // end v3+


    // Replace the history stack.
    this._stack = hist.stack.map((s, index) => {
      // Leave base graph alone, this first entry should have nothing in it.
      if (index === 0) return this._stack[0];

      let entities = {};

      if (Array.isArray(s.modified)) {
        s.modified.forEach(key => {
          const entity = modifiedEntities.get(key);
          entities[entity.id] = entity;
        });
      }

      if (Array.isArray(s.deleted)) {
        s.deleted.forEach(entityID => {
          entities[entityID] = undefined;
        });
      }

      // restore Rapid sources
      if (rapidSystem && s.annotation?.type === 'rapid_accept_feature') {
        const sourceTag = s.annotation.source;
        rapidSystem.sources.add('mapwithai');      // always add 'mapwithai'
        if (sourceTag && /^esri/.test(sourceTag)) {
          rapidSystem.sources.add('esri');       // add 'esri' for esri sources
        }
      }

      return {
        graph: new Graph(baseGraph).load(entities),
        annotation: s.annotation,
        imageryUsed: s.imageryUsed,
        photosUsed: s.photosUsed,
        transform: s.transform,
        selectedIDs: s.selectedIDs
      };
    });


    const transform = this._stack[this._index].transform;
    if (transform) {
      mapSystem.transform(transform);
    }

    if (loadComplete) {
      this.emit('change');
      this.emit('restore');
    }

    return this;
  }


  lock() {
    return this._mutex.lock();
  }


  unlock() {
    return this._mutex.unlock();
  }


  save() {
    // bail out if another browser tab has locked the mutex, or changes exist that the user may want to restore.
    if (!this._mutex.locked() || this._hasRestorableChanges) return;

    const storage = this.context.systems.storage;
    const json = this.toJSON();
    if (json) {
      const success = storage.setItem(this._historyKey(), json);
      if (!success) this.emit('storage_error');
    } else {
      storage.removeItem(this._historyKey());
    }
  }


  // delete the history version saved in localStorage
  clearSaved() {
    this.context.debouncedSave.cancel();

    // bail out if another browser tab has locked the mutex
    if (!this._mutex.locked()) return;

    this._hasRestorableChanges = false;
    const storage = this.context.systems.storage;
    storage.removeItem(this._historyKey());

    // clear the changeset metadata associated with the saved history
    storage.removeItem('comment');
    storage.removeItem('hashtags');
    storage.removeItem('source');
  }


  savedHistoryJSON() {
    const storage = this.context.systems.storage;
    return storage.getItem(this._historyKey());
  }


  hasRestorableChanges() {
    return this._hasRestorableChanges;
  }


  // load history from a version stored in localStorage
  restore() {
    if (this._mutex.locked()) {
      this._hasRestorableChanges = false;
      const json = this.savedHistoryJSON();
      if (json) this.fromJSON(json, true);
    }
  }


  // Rapid uses namespaced keys so multiple installations do not conflict
  _historyKey() {
    return 'Rapid_' + window.location.origin + '_saved_history';
  }


  // internal _act, accepts Array of actions and eased time
  _act(args, t) {
    let actions = args.slice();  // copy

    let annotation;
    if (typeof actions.at(-1) !== 'function') {
      annotation = actions.pop();
    }

    let graph = this._stack[this._index].graph;
    for (const fn of actions) {
      graph = fn(graph, t);
    }

    return {
      graph: graph,
      annotation: annotation,
      imageryUsed: this._imageryUsed,
      photosUsed: this._photosUsed,
      transform: this.context.projection.transform(),
      selectedIDs: this.context.selectedIDs()
    };
  }


  // internal _perform with eased time
  _perform(args, t) {
    const previous = this._stack[this._index].graph;
    this._stack = this._stack.slice(0, this._index + 1);
    const edit = this._act(args, t);
    this._stack.push(edit);
    this._index++;
    return this._change(previous);
  }


  // internal _replace with eased time
  _replace(args, t) {
    const previous = this._stack[this._index].graph;
    const edit = this._act(args, t);
    this._stack[this._index] = edit;
    return this._change(previous);
  }


  // internal this._overwrite with eased time
  _overwrite(args, t) {
    const previous = this._stack[this._index].graph;
    if (this._index > 0) {
      this._index--;
      this._stack.pop();
    }
    this._stack = this._stack.slice(0, this._index + 1);
    const edit = this._act(args, t);
    this._stack.push(edit);
    this._index++;
    return this._change(previous);
  }


  // determine difference and dispatch a change event
  _change(previous) {
    const difference = new Difference(previous, this.graph());
    if (!this._pausedGraph) {
      this.emit('change', difference);
    }
    return difference;
  }
}
