import { easeLinear as d3_easeLinear } from 'd3-ease';
import { select as d3_select } from 'd3-selection';
import { utilArrayDifference, utilArrayGroupBy, utilArrayUnion, utilObjectOmit, utilSessionMutex } from '@rapid-sdk/util';
import debounce from 'lodash-es/debounce';

import { AbstractSystem } from './AbstractSystem';
import { Difference, Edit, Graph, Tree } from './lib';
import { osmEntity } from '../osm/entity';
import { uiLoading } from '../ui/loading';


const DURATION = 150;


/**
 * `EditSystem` maintains the stack of user edits
 * (this used to be called 'history', but that word means something else in browsers)
 *
 * Each entry in the stack is an `Edit`.
 * The base entry in the stack is known as the "base graph".  It contains the base state of all editable map entities.
 *   (i.e. what the map looks like before the user starts editing it)
 * As more map is loaded, more features get merged into the base graph.
 *
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
    this.id = 'editor';   // was: 'history'
    this.dependencies = new Set(['imagery', 'map', 'photos', 'storage']);

    this._mutex = utilSessionMutex('lock');
    this._canRestoreBackup = false;

    this._stack = [];          // stack of edits
    this._index = 0;           // index of the current edit
    this._checkpoints = {};
    this._pausedGraph = null;
    this._inTransition = false;
    this._tree = null;
    this._initPromise = null;

    // Make sure the event handlers have `this` bound correctly
    this.perform = this.perform.bind(this);
    this.replace = this.replace.bind(this);
    this.overwrite = this.overwrite.bind(this);
    this.saveBackup = this.saveBackup.bind(this);
    this.deferredBackup = debounce(this.saveBackup, 1000, { leading: false, trailing: true });
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
        if (window.mocha) return;

        // Setup event handlers
        window.addEventListener('beforeunload', e => {
          if (this._index !== 0) {  // user did something
            e.preventDefault();
            this.saveBackup();
            return (e.returnValue = '');  // show browser prompt
          }
        });

        window.addEventListener('unload', () => this._mutex.unlock());

        // changes are restorable if Rapid is not open in another window/tab and a backup exists in localStorage
        this._canRestoreBackup = this._mutex.lock() && storage.hasItem(this._historyKey());
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
    this.deferredBackup.cancel();

    const baseGraph = new Graph();
    this._stack = [new Edit({ graph: baseGraph })];
    this._tree = new Tree(baseGraph);
    this._index = 0;
    this._checkpoints = {};
    this._pausedGraph = null;
    this.emit('reset');
  }


  /**
   * base
   * @return {Edit} The base Edit in the stack
   */
  get base() {
    return this._stack[0];
  }

  /**
   * current
   * @return {Edit} The current Edit in the stack
   */
  get current() {
    return this._stack[this._index];
  }

  /**
   * tree
   * @return {Tree} The Tree (spatial index)
   */
  get tree() {
    return this._tree;
  }


  peekAnnotation() {
    return this.current.annotation;
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
    const baseGraph = this.base.graph;
    const headGraph = this.current.graph;

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
          this._inTransition = true;
          this._perform([action0], 0);
        })
        .on('end interrupt', () => {
          this._inTransition = false;
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

    const previous = this.current.graph;
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

    const previousEdit = this.current;
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

    const previousEdit = this.current;

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


  /**
   * beginTransaction
   * This saves the current graph and starts a transaction.
   * During a transaction, edits can be performed but no `change` events will be disptached.
   * This is to prevent other parts of the code from rendering/validating partial or incomplete edits.
   */
  beginTransaction() {
    if (!this._pausedGraph) {
      this._pausedGraph = this.current.graph;
    }
  }


  /**
   * endTransaction
   * This marks the current transaction as complete.
   * A `change` event will be emitted that covers the difference from the beginning-end of the transaction.
   */
  endTransaction() {
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


  /**
   * intersects
   * Returns the entities from the active graph with bounding boxes
   * overlapping the given `extent`.
   * @prarm   {Extent}  extent - the extent to test
   * @return  {Array}   Entities intersecting the given Extent
   */
  intersects(extent) {
    return this._tree.intersects(extent, this.current.graph);
  }


  /**
   * difference
   * Returns a `Difference` containing all edits from base -> current
   * @return {Difference} The total changes made by the user during their edit session
   */
  difference() {
    const base = this.base.graph;
    const head = this.current.graph;
    return new Difference(base, head);
  }


  /**
   * changes
   * This returns a summery of all changes made from base -> current
   * Optionally including a given action to apply to the current graph.
   * @param  {Function?}  action - Optional action to apply to the current graph
   * @return {Object}     Object containing `modified`, `created`, `deleted` summary of changes
   */
  changes(action) {
    const base = this.base.graph;
    let head = this.current.graph;

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


  /**
   * hasChanges
   * This counts meangful edits only (modified, created, deleted)
   * For example, we could perform a bunch of no-op edits and it would still return false
   * @return `true` if the user has made any meaningful edits
   */
  hasChanges() {
    return this.difference().changes.size > 0;
  }


  /**
   * sourcesUsed
   * @return {Object}  Object of all sources used during the user's editing session
   */
  sourcesUsed() {
    const result = {
      imagery: new Set(),
      photos:  new Set(),
      data:    new Set()
    };

    for (let i = 0; i <= this._index; i++) {  // up to current edit (skip redo stack)
      const edit = this._stack[i];
      for (const which of ['imagery', 'photos', 'data']) {
        for (const val of edit.sources[which] || []) {
          result[which].add(val);
        }
      }
    }

    return result;
  }


  /**
   * setCheckpoint
   * This saves the current edit as a checkpoint that we can return to later.
   * @param  {string}  key - the name of the checkpoint
   */
  setCheckpoint(key) {
    d3_select(document).interrupt('editTransition');

    this._checkpoints[key] = {
      stack: this._stack,
      index: this._index
    };
    return this;
  }


  /**
   * resetToCheckpoint
   * This returns the state back to the edit identified by the given checkpoint key.
   * @param  {string}  key - the name of the checkpoint
   */
  resetToCheckpoint(key) {
    d3_select(document).interrupt('editTransition');

    if (key !== undefined && this._checkpoints.hasOwnProperty(key)) {  // reset to given key
      const fromGraph = this.current.graph;

      this._stack = this._checkpoints[key].stack;
      this._index = this._checkpoints[key].index;

      const toGraph = this._stack[this._index].graph;
      const difference = new Difference(fromGraph, toGraph);
      this.emit('change', difference);
    }
  }


  /**
   * toIntroGraph
   * Used to export the intro graph used by the walkthrough.
   * This function is indended to be called manually by developers.
   * We only use this on very rare occasions to change the walkthrough data.
   *
   * To use it:
   *  1. Start the walkthrough.
   *  2. Get to a "free editing" tutorial step
   *  3. Make your edits to the walkthrough map
   *  4. In your browser dev console run:  `context.systems.editor.toIntroGraph()`
   *  5. This outputs stringified JSON to the browser console
   *  6. Copy it to `data/intro_graph.json` and prettify it in your code editor
   */
  toIntroGraph() {
    const nextID = { n: 0, r: 0, w: 0 };
    const permIDs = {};
    const graph = this.current.graph;
    const result = new Map();   // Map(entityID -> Entity)

    // Copy base entities..
    for (const entity of graph.base.entities.values()) {
      const copy = _copyEntity(entity);
      result.set(copy.id, copy);
    }

    // Replace base entities with head entities..
    for (const [entityID, entity] of graph.local.entities) {
      if (entity) {
        const copy = _copyEntity(entity);
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
    const obj = {};
    for (const [k, v] of result) { obj[k] = v; }
    return JSON.stringify({ dataIntroGraph: obj });


    // Return a simplified copy of the Entity to save space.
    function _copyEntity(entity) {
      const copy = utilObjectOmit(entity, ['type', 'user', 'v', 'version', 'visible']);

      // Note: the copy is no longer an osmEntity, so it might not have `tags`
      if (copy.tags && Object.keys(copy.tags).length === 0) {
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


  /**
   * toJSON
   * Save the edit history to JSON
   * @return {String?}  A String containing the JSON, or `undefined` if nothing to save
   */
  toJSON() {
    if (!this.hasChanges()) return;

    const OSM_PRECISION = 7;
    const baseGraph = this.base.graph;   // The initial unedited graph
    const modifiedEntities = new Map();  // Map(Entity.key -> Entity)
    const baseEntities = new Map();      // Map(entityID -> Entity)
    const stackData = [];

    // Preserve the users stack of edits..
    for (const edit of this._stack) {
      const currGraph = edit.graph;   // edit done at this point in time
      const modified = [];
      const deleted = [];

      // watch out: for modified entities we index on "key" - e.g. "n1v1"
      for (const [entityID, entity] of currGraph.local.entities) {
        if (entity) {
          const key = osmEntity.key(entity);
          modifiedEntities.set(key, _copyEntity(entity));
          modified.push(key);
        } else {
          deleted.push(entityID);
        }

        // Collect the original versions of edited Entities.
        const original = baseGraph.hasEntity(entityID);
        if (original && !baseEntities.has(entityID)) {
          baseEntities.set(entityID, _copyEntity(original));
        }

        // For modified ways, collect originals of child nodes also.
        // (This is needed for situations where we connect a way to an existing node)
        if (entity && entity.nodes) {
          for (const childID of entity.nodes) {
            const child = baseGraph.hasEntity(childID);
            if (child && !baseEntities.has(child.id)) {
              baseEntities.set(child.id, _copyEntity(child));
            }
          }
        }

        // Collect original parent ways also.
        // (This is needed for situations where we reshape or move a way -
        //  behind the scenes, only the nodes were really modified)
        if (original) {
          for (const parent of baseGraph.parentWays(original)) {
            if (!baseEntities.has(parent.id)) {
              baseEntities.set(parent.id, _copyEntity(parent));
            }
          }
        }
      }

      const sources = edit.sources || {};

      const item = {};
      if (modified.length)   item.modified = modified;
      if (deleted.length)    item.deleted = deleted;
      if (edit.annotation)   item.annotation = edit.annotation;
      if (edit.selectedIDs)  item.selectedIDs = edit.selectedIDs;
      if (edit.transform)    item.transform = edit.transform;
      if (sources.imagery)   item.imageryUsed = sources.imagery;
      if (sources.photos)    item.photosUsed = sources.photos;
      if (sources.data)      item.dataUsed = sources.data;
      stackData.push(item);
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


    // Return a simplified copy of the Entity to save space.
    function _copyEntity(entity) {
      // omit 'visible'
      const copy = utilObjectOmit(entity, ['visible']);

      // omit 'tags' if empty
      if (copy.tags && Object.keys(copy.tags).length === 0) {
        delete copy.tags;
      }

      // simplify float precision
      if (Array.isArray(copy.loc)) {
        copy.loc[0] = +copy.loc[0].toFixed(OSM_PRECISION);
        copy.loc[1] = +copy.loc[1].toFixed(OSM_PRECISION);
      }
      return copy;
    }

  }


  /**
   * fromJSON
   * Restore the edit history from a JSON string.
   * Optionally fetch missing child nodes from OSM
   *   (bhousel - not clear to me under what circumstances we would have a `false` here?)
   * @param  {String}   json - Stringified JSON to parse
   * @param  {boolean}  loadChildNodes - if `true` also attempt to fetch child nodes from OSM
   * @return {String?}  A String containing the JSON, or `undefined` if nothing to save
   */
  fromJSON(json, loadChildNodes) {
    const context = this.context;
    const map = context.systems.map;

    const baseGraph = this.base.graph;   // The initial unedited graph
    const hist = JSON.parse(json);
    let loadComplete = true;

    if (hist.version !== 3) {
      throw new Error(`History version ${hist.version} not supported.`);
    }

    osmEntity.id.next = hist.nextIDs;
    this._index = hist.index;

    // Instantiate the modified entities
    const modifiedEntities = new Map();  // Map(Entity.key -> Entity)
    for (const e of hist.entities) {
      modifiedEntities.set(osmEntity.key(e), osmEntity(e));
    }

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
        map.redrawEnabled = false;

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

            // Fetch older versions of nodes that were deleted..
            for (const entity of invisibles) {
              osm.loadEntityVersion(entity.id, +entity.version - 1, _childNodesLoaded);
            }
          }

          if (err || !missing.length) {
            loading.close();
            map.redrawEnabled = true;
            this.emit('change');
            this.emit('restore');
          }
        };

        osm.loadMultiple(missing, _childNodesLoaded);
      }
    }


    // Reconstruct the history stack..
    this._stack = hist.stack.map((item, index) => {
      // Leave base graph alone, this first edit should have nothing in it.
      if (index === 0) return this.base;

      const entities = {};
      if (Array.isArray(item.modified)) {
        item.modified.forEach(key => {
          const entity = modifiedEntities.get(key);
          entities[entity.id] = entity;
        });
      }
      if (Array.isArray(item.deleted)) {
        item.deleted.forEach(entityID => {
          entities[entityID] = undefined;
        });
      }

      const sources = {};
      if (Array.isArray(item.imageryUsed))  sources.imagery = item.imageryUsed;
      if (Array.isArray(item.photosUsed))   sources.photos = item.photosUsed;
      if (Array.isArray(item.dataUsed))     sources.data = item.dataUsed;

      return new Edit({
        annotation:  item.annotation,
        graph:       new Graph(baseGraph).load(entities),
        selectedIDs: item.selectedIDs,
        sources:     sources,
        transform:   item.transform
      });
    });


    const transform = this.current.transform;
    if (transform) {
      map.transform(transform);
    }

    if (loadComplete) {
      this.emit('change');
      this.emit('restore');
    }

    return this;
  }


  /**
   * saveBackup
   * Backup the user's edits to a JSON string in localStorage.
   * This code runs occasionally as the user edits.
   * @return  `true` if a backup was saved
   */
  saveBackup() {
    const context = this.context;
    if (context.inIntro) return;               // don't backup edits made in the walkthrough
    if (context.mode?.id === 'save') return;   // edits made in save mode may be conflict resolutions
    if (this._canRestoreBackup) return;        // waiting to see if the user wants to restore other edits
    if (this._pausedGraph) return;             // don't backup edits mid-transaction
    if (this._inTransition) return;            // don't backup edits mid-transition
    if (!this._mutex.locked()) return;         // another browser tab owns the history

    const storage = context.systems.storage;
    const json = this.toJSON();
    if (json) {
      const success = storage.setItem(this._historyKey(), json);
      if (success) {
        return true;
      } else {
        this.emit('storage_error');
      }
    }
  }


  /**
   * canRestoreBackup
   * This flag will be `true` if `initAsync` has determined that there is a restorable
   *  backup, and we are waiting on the user to make a decision about what to do with it.
   * @return `true` if there is a backup to restore
   * @readonly
   */
  get canRestoreBackup() {
    return this._canRestoreBackup;
  }


  /**
   * restoreBackup
   * Restore the user's backup from localStorage
   * This happens when:
   * - The user chooses to "Restore my changes" from the restore screen
   */
  restoreBackup() {
    this._canRestoreBackup = false;

    if (!this._mutex.locked()) return;  // another browser tab owns the history

    const storage = this.context.systems.storage;
    const json = storage.getItem(this._historyKey());
    if (json) {
      this.fromJSON(json, true);
    }
  }


  /**
   * clearBackup
   * Remove any backup stored in localStorage
   * This happens when:
   * - The user chooses to "Discard my changes" from the restore screen
   * - The user switches sources with the source switcher
   * - A changeset is inflight, we remove it to prevent the user from restoring duplicate edits
   */
  clearBackup() {
    this._canRestoreBackup = false;
    this.deferredBackup.cancel();

    if (!this._mutex.locked()) return;  // another browser tab owns the history

    const storage = this.context.systems.storage;
    storage.removeItem(this._historyKey());

    // clear the changeset metadata associated with the saved history
    storage.removeItem('comment');
    storage.removeItem('hashtags');
    storage.removeItem('source');
  }


  // Rapid uses namespaced keys so multiple installations do not conflict
  _historyKey() {
    return 'Rapid_' + window.location.origin + '_saved_history';
  }


  // internal _act, accepts Array of actions and eased time
  _act(args, t = 1) {
    const context = this.context;

    let actions = args.slice();  // copy

    let annotation;
    if (typeof actions.at(-1) !== 'function') {
      annotation = actions.pop();
    }

    let graph = this.current.graph;
    for (const fn of actions) {
      graph = fn(graph, t);
    }

    // Gather sources used to make this edit
    // (only bother with this if it's a final edit, t === 1)
    const sources = {};
    if (t === 1) {
      const imageryUsed = context.systems.imagery.imageryUsed();
      if (imageryUsed.length)  {
        sources.imagery = imageryUsed;
      }

      const photosUsed = context.systems.photos.photosUsed();
      if (photosUsed.length) {
        sources.photos = photosUsed;
      }

      const customLayer = context.scene().layers.get('custom-data');
      const customDataUsed = customLayer?.dataUsed() || [];
      const rapidDataUsed = annotation?.dataUsed || [];
      const dataUsed = [...rapidDataUsed, ...customDataUsed];
      if (dataUsed.length) {
        sources.data = dataUsed;
      }
    }

    return new Edit({
      annotation:   annotation,
      graph:        graph,
      selectedIDs:  context.selectedIDs(),
      sources:      sources,
      transform:    context.projection.transform()
    });
  }


  // internal _perform with eased time
  _perform(args, t) {
    const previous = this.current.graph;
    this._stack = this._stack.slice(0, this._index + 1);
    const edit = this._act(args, t);
    this._stack.push(edit);
    this._index++;
    return this._change(previous);
  }


  // internal _replace with eased time
  _replace(args, t) {
    const previous = this.current.graph;
    const edit = this._act(args, t);
    this._stack[this._index] = edit;
    return this._change(previous);
  }


  // internal this._overwrite with eased time
  _overwrite(args, t) {
    const previous = this.current.graph;
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
    const difference = new Difference(previous, this.current.graph);
    if (!this._pausedGraph) {
      this.deferredBackup();
      this.emit('change', difference);
    }
    return difference;
  }
}
