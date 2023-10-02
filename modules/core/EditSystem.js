import { easeLinear as d3_easeLinear } from 'd3-ease';
import { select as d3_select } from 'd3-selection';
import { utilArrayGroupBy, utilObjectOmit, utilSessionMutex } from '@rapid-sdk/util';
import debounce from 'lodash-es/debounce';

import { AbstractSystem } from './AbstractSystem';
import { Difference, Edit, Graph, Tree } from './lib';
import { osmEntity } from '../osm/entity';
import { uiLoading } from '../ui/loading';


const DURATION = 150;


/**
 * `EditSystem` maintains the history of user edits.
 * (This used to be called 'history', but that word means something else in browsers)
 *
 * This system maintains a Base Graph, a stack of Edit history, and a `current` Edit.
 *
 * The Base Graph contains the base map state - all map entities that have been loaded
 *   and what they look like before any edits have occurred.
 * As more map is loaded, more map features get merged into the Base Graph.
 *
 * Each entry in the history stack is an `Edit`.  An Edit may contain:
 *  - `annotation`  - undo/redo annotation, a String saying what the Edit did. e.g. "Started a Line".
 *  - `graph`       - Graph at the time of the Edit
 *  - `selectedIDs` - ids that the user had selected at tht time
 *  - `sources`     - sources being used to make the Edit (imagery, photos, data)
 *  - `transform`   - map transform at the time of the Edit
 *
 * Edits with an `annotation` represent states that we can undo or redo into.
 *
 * Special named Edits:
 *  - `base` - The initial Edit, `history[0]`.
 *     The `base` Edit contains the Base Graph and nothing else.
 *  - `stable` - The latest accepted Edit, `history[index]`.
 *     The `stable` Edit is suitable for validation, backups, saving.
 *  - `current` - A work-in-progress Edit, not yet added to the history.
 *     The `current` Edit is used throughout the application to determine the current map state
 *
 *  The history might look like this:
 *
 *   `base`           …undo    `stable`   redo…
 *  [ Edit0 --> … --> Edit1 --> Edit2 --> Edit3 ]
 *                                 \
 *                                  \-->  EditN
 *                                       `current` (WIP after `stable`)
 *
 * Code elsewhere in the application can use these methods to record edits and manipulate the history:
 *
 * - `perform(action)` - This performs a bit of work.  Perform accepts a varible number of
 *     "action" arguments. Actions are functions that accept a Graph and return a modified Graph.
 *     All work is performed against the `current` edit.
 * - `rollback()` - This rolls back all work in progress by replacing `current`
 *     with a fresh copy of `stable`.
 * - `commit(annotation)` - This accepts the `current` work-in-progress edit by adding
 *      it to the end of the history (removing any forward redo history, if any)
 *      Commit accepts an `annotation` (e.g. "Started a line") to say what the edit does.
 * - `commitAppend(annotation)` - This is just like `commit` but instead of
 *      adding `current` after `stable`, `current` replaces `stable`.
 * - `undo()` - Move the `stable` index back to the previous Edit (or `_index = 0`).
 * - `redo()`  -Move the `stable` index forward to the next Edit (if any)
 *
 *
 * Events available:
 *   'editchange'     - Fires on every edit performed (i.e. when `current` changes)
 *   'historychange'  - Fires when the history changes (i.e. when `stable` changes)
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

    this._history = [];        // history of accepted edits (both undo and redo) (was called "stack")
    this._index = 0;           // index of the latest `stable` edit
    this._current = null;      // work in progress edit, not yet added to the history
    this._checkpoints = {};
    this._inTransition = false;
    this._inTransaction = false;
    this._tree = null;

    this._lastStable = null;
    this._lastCurrent = null;
    this._fullDifference = null;

    this._initPromise = null;

    // Make sure the event handlers have `this` bound correctly
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
        this._canRestoreBackup = this._mutex.lock() && storage.hasItem(this._backupKey());
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

    // Create a new Base Graph / Base Edit.
    const base = new Graph();
    this._history = [ new Edit({ graph: base }) ];
    this._index = 0;

    // Create a work-in-progress Edit derived from the base edit.
    const current = new Graph(base);
    this._current = new Edit({ graph: current });

    this._lastStable = base;
    this._lastCurrent = current;
    this._fullDifference = new Difference(base, base);

    this._tree = new Tree(current);
    this._checkpoints = {};
    this._inTransition = false;
    this._inTransaction = false;
    this.emit('reset');
  }


  /**
   * base
   * The `base` edit is the initial edit in the history.  It contains the Base Graph.
   * It will not contain any actual user edits, sources, annotation.
   * @return {Edit} The initial Edit containing the Base Graph
   */
  get base() {
    return this._history[0];
  }

  /**
   * stable
   * The `stable` edit is the latest accepted edit in the history, as indicated by `_index`.
   * The `stable` edit is suitable for validation or backups.
   * Before the user edits anything, `_index === 0`, so the `stable === base`.
   * Note that "future" redo history can continue past the `stable` edit, if the user has undone.
   * @return {Edit} The latest accepted Edit in the history
   */
  get stable() {
    return this._history[this._index];
  }

  /**
   * current
   * The `current` edit will be a placeholder work-in-progress edit in the chain immediately
   * following the `stable` edit.  The user may be drawing the feature or editing the tags.
   * The `current` edit has not been added to the history yet.
   * @return {Edit} The `current` work-in-progress Edit
   */
  get current() {
    return this._current;
  }

  /**
   * tree
   * @return {Tree} The Tree (spatial index)
   */
  get tree() {
    return this._tree;
  }

  /**
   * history
   * A shallow copy of the history.
   * @return {Array} A shallow copy of the history
   */
  get history() {
    return this._history.slice();
  }

  /**
   * index
   * Index pointing to the current `stable` Edit
   * @return {number} Index pointing to the current `stable` Edit
   */
  get index() {
    return this._index;
  }


  /**
   * perform
   * This performs a bit of work.  Perform accepts a variable number of "action" arguments.
   * Actions are functions that accept a Graph and return a modified Graph.
   * All work is performed against the `current` edit.
   * If multiple functions are passed, they will be performed in order,
   *   and change events will dispatch after they have all completed.
   * @param   {...Function}  args - Variable number of Action functions to peform
   * @return  {Difference}   Difference between before and after of `current` Edit
   */
  perform(...args) {
    // complete any transition already in progress
    d3_select(document).interrupt('editTransition');

//    // We can perform a eased edit in a transition if we have:
//    // - a single action
//    // - and that action is 'transitionable' (i.e. accepts eased time parameter)
//    const action0 = args[0];
//    let isTransitionable = false;
//    if (args.length === 1) {
//      isTransitionable = !!action0.transitionable;
//    }
//
//    if (isTransitionable) {
//      d3_select(document)
//        .transition('editTransition')
//        .duration(DURATION)
//        .ease(d3_easeLinear)
//        .tween('history.tween', () => {
//          return (t) => {
//            if (t < 1) this._perform(args, t);
//          };
//        })
//        .on('start', () => {
//          this._inTransition = true;
//          this._perform(args, 0);
//        })
//        .on('end interrupt', () => {
//          this._perform(args, 1);
//          this._inTransition = false;
//        });
//
//    } else {
      return this._perform(args, 1);
//    }
  }


  /**
   * rollback
   * This rolls back the `current` work-in-progress
   * by replacing `current` with a fresh copy of `stable`.
   */
  rollback() {
    d3_select(document).interrupt('editTransition');

    // Create a new `current` work-in-progress Edit
    this._current = new Edit({ graph: new Graph(this.stable.graph) });

    return this._emitChangeEvents();
  }


  /**
   * commit
   * This finalizes the `current` work-in-progress edit.
   * (It's somewhat like what `git commit` does.)
   *  - Set annotation, sources, and other edit metadata properties
   *  - Add the `current` edit to the end of the history (at this point `current` becomes `stable`)
   *  - Finally, create a new empty `current` work-in-progress Edit
   *
   * Before calling `commit()`:
   *
   *   `base`           …undo    `stable`   redo…
   *  [ Edit0 --> … --> Edit1 --> Edit2 --> Edit3 ]
   *                                 \
   *                                  \-->  EditN0
   *                                       `current` (WIP after Edit2)
   * After calling `commit()`:
   *
   *   `base`                     …undo    `stable`
   *  [ Edit0 --> … --> Edit1 --> Edit2 --> EditN0 ]
   *                                           \
   *                                            \-->  EditN1
   *                                                 `current` (WIP after EditN0)
   *
   * @param {string|Object} annotation - A String saying what the Edit did. e.g. "Started a Line".
   *   Note that Rapid edits pass an Object as the annotation including more info about the edit.
   */
  commit(annotation = '') {
    const context = this.context;
    const current = this.current;

    current.annotation  = annotation;
    current.selectedIDs = context.selectedIDs();
    current.sources     = this._gatherSources(annotation);
    current.transform   = context.projection.transform();

    // Discard forward/redo history if any, and add `current` after `stable`
    this._history.splice(this._index + 1, Infinity, current);
    this._index++;
    // (At this point `stable` === `current`)

    // Create a new `current` work-in-progress Edit
    this._current = new Edit({ graph: new Graph(this.stable.graph) });

    this.deferredBackup();
    this._emitChangeEvents();
  }


  /**
   * commitAppend
   * This is like `commit`, but instead of adding `current` after stable,
   *   it replaces `stable` with `current` and does not advance the history.
   * (It's somewhat like what `git commit --append` does.)
   *  - Set annotation, sources, and other edit metadata properties
   *  - Replace the `stable` edit with the `current` edit (at this point `current` becomes `stable`)
   *  - Finally, create a new empty `current` work-in-progress Edit
   *
   * Note:  You can't do this if there are no edits yet - it will throw if you try to append to the `base` edit.
   *
   * Before calling `commitAppend()`:
   *
   *   `base`           …undo    `stable`   redo…
   *  [ Edit0 --> … --> Edit1 --> Edit2 --> Edit3 ]
   *                                 \
   *                                  \-->  EditN0
   *                                       `current` (WIP after Edit2)
   * After calling `commitAppend()`:
   *
   *   `base`           …undo    `stable`
   *  [ Edit0 --> … --> Edit1 --> EditN0 ]
   *                                 \
   *                                  \-->  EditN1
   *                                       `current` (WIP after EditN0)
   *
   * @param {string|Object} annotation - A String saying what the Edit did. e.g. "Started a Line".
   *   Note that Rapid edits pass an Object as the annotation including more info about the edit.
   * @throws  Will throw if you try to append to the `base` edit
   */
  commitAppend(annotation = '') {
    const context = this.context;
    const current = this.current;

    if (this._index === 0) {
      throw new Error(`Can not commitAppend to the base edit!`);
    }

    current.annotation  = annotation;
    current.selectedIDs = context.selectedIDs();
    current.sources     = this._gatherSources(annotation);
    current.transform   = context.projection.transform();

    // Discard forward/redo history if any, and replace `stable` with `current`.
    this._history.splice(this._index, Infinity, current);
    // (At this point `stable` === `current`)

    // Create a new `current` work-in-progress Edit
    this._current = new Edit({ graph: new Graph(this.stable.graph) });

    this.deferredBackup();
    this._emitChangeEvents();
  }


  /**
   * undo
   * Move the `stable` index back to the previous Edit (or `_index = 0`).
   * Note that all work-in-progress in the `current` Edit is lost when calling `undo()`.
   *
   * Before calling `undo()`:
   *
   *   `base`           …undo    `stable`   redo…
   *  [ Edit0 --> … --> Edit1 --> Edit2 --> Edit3 ]
   *                                 \
   *                                  \-->  EditN0
   *                                       `current` (WIP after Edit2)
   * After calling `undo()`:
   *
   *   `base`  …undo   `stable`   redo…
   *  [ Edit0 --> … --> Edit1 --> Edit2 --> Edit3 ]
   *                       \
   *                        \-->  EditN1
   *                             `current` (WIP after Edit1)
   */
  undo() {
    d3_select(document).interrupt('editTransition');

    const previous = this.current;
    while (this._index > 0) {
      this._index--;
      if (this._history[this._index].annotation) break;
    }

    // Create a new `current` work-in-progress Edit
    this._current = new Edit({ graph: new Graph(this.stable.graph) });
    this.emit('undone', this.stable, previous);
    return this._emitChangeEvents();
  }


  /**
   * redo
   * Move the `stable` index forward to the next Edit (if any)
   * Note that all work-in-progress in the `current` Edit is lost when calling `redo()`.
   *
   * Before calling `redo()`:
   *
   *   `base`           …undo    `stable`   redo…
   *  [ Edit0 --> … --> Edit1 --> Edit2 --> Edit3 ]
   *                                 \
   *                                  \-->  EditN0
   *                                       `current` (WIP after Edit2)
   * After calling `redo()`:
   *
   *   `base`                     …undo    `stable`
   *  [ Edit0 --> … --> Edit1 --> Edit2 --> Edit3 ]
   *                                           \
   *                                            \-->  EditN1
   *                                                 `current` (WIP after Edit3)
   */
  redo() {
    d3_select(document).interrupt('editTransition');

    const previous = this.current;

    let tryIndex = this._index;
    while (tryIndex < this._history.length - 1) {
      tryIndex++;
      if (this._history[tryIndex].annotation) {
        this._index = tryIndex;
        // Create a new `current` work-in-progress Edit
        this._current = new Edit({ graph: new Graph(this.stable.graph) });
        this.emit('redone', this.stable, previous);
        break;
      }
    }

    return this._emitChangeEvents();
  }


  /**
   *  merge
   *  Merge new entities into the Base Graph.
   *  This function is called when we have parsed a new tile of OSM data, we will
   *   receive the new entities and a list of all entity ids that the tile contains.
   *  Can also be called in other situations, like restoring history from
   *  storage, or loading specific entities from the OSM API.
   *  (Sorry, but this one is not like what `git merge` does.)
   *
   *  @param  entities  Entities to merge into the history (usually only the new ones)
   *  @param  seenIDs?  Optional - All entity IDs on the tile (including previously seen ones)
   */
  merge(entities, seenIDs) {
    const baseGraph = this.base.graph;
    const headGraph = this.current.graph;

    if (!(seenIDs instanceof Set)) {
      seenIDs = new Set(entities.map(entity => entity.id));
    }

    // Which ones are really new (not in the Base Graph)?
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

    const graphs = this._history.map(state => state.graph);
    baseGraph.rebase(entities, graphs, false);  // force = false
    this._tree.rebase(entities, false);         // force = false

    this.emit('merge', seenIDs);
  }


  /**
   * beginTransaction
   * Prevents events from being dispatched.
   * During a transaction, edits can be performed but no `change` events will be disptached.
   * This is to prevent other parts of the code from rendering/validating partial or incomplete edits.
   */
  beginTransaction() {
    this._inTransaction = true;
  }


  /**
   * endTransaction
   * This marks the transaction as complete, and allows events to be dispatched again.
   * Any `editchange` and `historychange` events will be emitted that cover
   * the difference from the beginning -> end of the transaction.
   */
  endTransaction() {
    this._inTransaction = false;
    return this._emitChangeEvents();
  }


  /**
   * getUndoAnnotation
   * @return  {string?}  The previous undo annotation, or `undefined` if none
   */
  getUndoAnnotation() {
    let i = this._index;
    while (i >= 0) {
      const edit = this._history[i];
      if (edit.annotation) return edit.annotation;
      i--;
    }
  }


  /**
   * getRedoAnnotation
   * @return  {string?}  The next redo annotation, or `undefined` if none
   */
  getRedoAnnotation() {
    let i = this._index + 1;
    while (i <= this._history.length - 1) {
      const edit = this._history[i];
      if (edit.annotation) return edit.annotation;
      i++;
    }
  }


  /**
   * intersects
   * Returns the entities from the `current` graph with bounding boxes overlapping the given `extent`.
   * @prarm   {Extent}  extent - the extent to test
   * @return  {Array}   Entities intersecting the given Extent
   */
  intersects(extent) {
    return this._tree.intersects(extent, this.current.graph);
  }


  /**
   * difference
   * Returns a `Difference` containing all edits from `base` -> `stable`
   * We use this pretty frequently, so it's cached in `this._fullDifference`
   *  and recomputed by the `_emitChangeEvents` function only when `stable` changes.
   * @return {Difference} The total changes made by the user during their edit session
   */
  difference() {
    return this._fullDifference;
  }


  /**
   * changes
   * This returns a summery of all changes made from `base` -> `stable`
   * Optionally includes a given action function to apply to the `stable` graph.
   * @param  {Function?}  action - Optional action to apply to the `stable` graph
   * @return {Object}     Object containing `modified`, `created`, `deleted` summary of changes
   */
  changes(action) {
    let difference = this._fullDifference;

    if (action) {
      const base = this.base.graph;
      const head = action(this.stable.graph);
      difference = new Difference(base, head);
    }

    return {
      modified: difference.modified(),
      created: difference.created(),
      deleted: difference.deleted()
    };
  }


  /**
   * hasChanges
   * This counts meangful edits only (modified, created, deleted).
   * For example, we could perform a bunch of no-op edits and it would still return false.
   * @return `true` if the user has made any meaningful edits
   */
  hasChanges() {
    return this._fullDifference.changes.size > 0;
  }


  /**
   * sourcesUsed
   * This prepares the list of all sources used during the user's editing session.
   * This is called by `commit.js` when preparing the changeset before uploading.
   * @return {Object}  Object of all sources used during the user's editing session
   */
  sourcesUsed() {
    const result = {
      imagery: new Set(),
      photos:  new Set(),
      data:    new Set()
    };

    // Start at `1` - there won't be sources on the `base` edit..
    // End at `_index` - don't continue into the redo part of the history..
    for (let i = 1; i <= this._index; i++) {
      const edit = this._history[i];
      for (const which of ['imagery', 'photos', 'data']) {
        for (const val of edit.sources[which] ?? []) {
          result[which].add(val);
        }
      }
    }

    return result;
  }


  /**
   * setCheckpoint
   * This saves the `history` and `index` as a checkpoint that we can return to later.
   * @param  {string}  key - the name of the checkpoint
   */
  setCheckpoint(key) {
    d3_select(document).interrupt('editTransition');

    // Save a shallow copy of history, in case user undos away the edit that index points to.
    this._checkpoints[key] = {
      history: this._history.slice(),  // shallow copy
      index: this._index
    };
  }


  /**
   * restoreCheckpoint
   * This returns the `history` and `index` back to the edit identified by the given checkpoint key.
   * @param  {string}  key - the name of the checkpoint
   */
  restoreCheckpoint(key) {
    d3_select(document).interrupt('editTransition');

    if (key && this._checkpoints.hasOwnProperty(key)) {  // reset to given key
      this._history = this._checkpoints[key].history;
      this._index = this._checkpoints[key].index;
      this._emitChangeEvents();
    }
  }


  /**
   * toIntroGraph
   * This is used to export the intro graph used by the walkthrough.
   * This function is indended to be called manually by developers.
   * We only use this on very rare occasions to change the walkthrough data.
   *
   * To use it:
   *  1. Start the walkthrough.
   *  2. Get to a "free editing" tutorial step
   *  3. Make your edits to the walkthrough map
   *  4. In your browser dev console run:  `context.systems.editor.toIntroGraph()`
   *  5. This outputs stringified JSON to the browser console (it will be a lot!)
   *  6. Copy it to `data/intro_graph.json` and prettify it in your code editor
   *
   * @returns {string} The stringified walkthrough data
   */
  toIntroGraph() {
    const nextID = { n: 0, r: 0, w: 0 };
    const permIDs = {};
    const graph = this.stable.graph;
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
          member.id = permIDs[member.id] ?? member.id;
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
   * Save the edit history to JSON.
   * @return  {string?}  A String containing the JSON, or `undefined` if nothing to save
   */
  toJSON() {
    if (!this.hasChanges()) return;

    const OSM_PRECISION = 7;
    const baseGraph = this.base.graph;   // The initial unedited graph
    const modifiedEntities = new Map();  // Map(Entity.key -> Entity)
    const baseEntities = new Map();      // Map(entityID -> Entity)
    const historyData = [];

    // Preserve the users history of edits..
    for (const edit of this._history) {
      const modified = [];
      const deleted = [];

      // watch out: for modified entities we index on "key" - e.g. "n1v1"
      for (const [entityID, entity] of edit.graph.local.entities) {
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

        // For modified ways, collect originals of child nodes also. - iD#4108
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

      const sources = edit.sources ?? {};

      const item = {};
      if (modified.length)   item.modified = modified;
      if (deleted.length)    item.deleted = deleted;
      if (edit.annotation)   item.annotation = edit.annotation;
      if (edit.selectedIDs)  item.selectedIDs = edit.selectedIDs;
      if (edit.transform)    item.transform = edit.transform;
      if (sources.imagery)   item.imageryUsed = sources.imagery;
      if (sources.photos)    item.photosUsed = sources.photos;
      if (sources.data)      item.dataUsed = sources.data;
      historyData.push(item);
    }

    return JSON.stringify({
      version: 3,
      entities: [...modifiedEntities.values()],
      baseEntities: [...baseEntities.values()],
      stack: historyData,
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
   *   (bhousel - not clear to me under what circumstances we would have a `false` here? Test environment?)
   * @param  {string}   json - Stringified JSON to parse
   * @param  {boolean}  loadMissing - if `true` also attempt to fetch missing child nodes from OSM API
   * @return {string?}  A String containing the JSON, or `undefined` if nothing to save
   */
  fromJSON(json, loadMissing) {
    const context = this.context;
    const map = context.systems.map;

    const baseGraph = this.base.graph;   // The initial unedited Graph
    const loading = uiLoading(context).blocking(true);  // Only shown if we are looking for missingIDs
    const backup = JSON.parse(json);

    if (backup.version !== 3) {
      throw new Error(`Backup version ${backup.version} not supported.`);
    }

    // Restore the modified entities
    const modifiedEntities = new Map();  // Map(Entity.key -> Entity)
    for (const e of backup.entities) {
      modifiedEntities.set(osmEntity.key(e), osmEntity(e));
    }

    // Restore base entities..
    const baseEntities = backup.baseEntities.map(e => osmEntity(e));

    // Reconstruct the edit history..
    let prevGraph = baseGraph;
    this._history = backup.stack.map((item, index) => {
      // Leave the base edit alone, this first edit should have nothing in it.
      if (index === 0) return this.base;

      const entities = {};
      for (const key of item.modified ?? []) {
        const entity = modifiedEntities.get(key);
        entities[entity.id] = entity;
      }
      for (const entityID of item.deleted ?? []) {
        entities[entityID] = undefined;
      }

      const graph = new Graph(prevGraph).load(entities);
      prevGraph = graph;

      const sources = {};
      if (Array.isArray(item.imageryUsed))  sources.imagery = item.imageryUsed;
      if (Array.isArray(item.photosUsed))   sources.photos = item.photosUsed;
      if (Array.isArray(item.dataUsed))     sources.data = item.dataUsed;

      return new Edit({
        annotation:  item.annotation,
        graph:       graph,
        selectedIDs: item.selectedIDs,
        sources:     sources,
        transform:   item.transform
      });
    });

    // Restore some other properties..
    osmEntity.id.next = backup.nextIDs;
    this._index = backup.index;

    // Merge originals into Base Graph.
    // Note that the force parameter is `true` here to replace anything that might
    // have been loaded from the API while the user was waiting to press "restore".
    const graphs = this._history.map(edit => edit.graph);
    baseGraph.rebase(baseEntities, graphs, true);   // force = true
    this._tree.rebase(baseEntities, true);          // force = true

    // Call _finish when we believe we have everything.
    const _finish = () => {
      // Create a new `current` work-in-progress Edit
      this._current = new Edit({ graph: new Graph(this.stable.graph) });

      const transform = this.stable.transform;
      if (transform) {
        map.transform(transform);
      }

      const selectedIDs = this.stable.selectedIDs;
      if (selectedIDs) {
        context.enter('select-osm', { selectedIDs: selectedIDs });
      }

      loading.close();             // unblock ui
      map.redrawEnabled = true;    // unbock drawing
      this.emit('restore');
      this._emitChangeEvents();
    };


    // When we restore modified ways, we also need to fetch any missing childNodes
    // that would normally have been downloaded with those ways.. see iD#2142
    // As added challenges:
    //  - We have to keep the UI blocked while this is happening, because it's destructive to the graphs/edits.
    //  - Callback can be called multiple times, so we have to keep track of how many of the missing nodes we got.
    //  - The child nodes may have been deleted, so we may have to fetch older non-deleted copies
    //
    // A thought I'm having is - if we need to do all this anyway, it might make more sense to just store the
    // base version numbers rather than base entities, then use loadEntityVersion to fetch exactly what we need.
    //
    const missingIDs = new Set();
    const osm = context.services.osm;
    if (loadMissing && osm) {
      const baseWays = baseEntities.filter(entity => entity.type === 'way');
      for (const way of baseWays) {
        for (const nodeID of way.nodes) {
          if (!baseGraph.hasEntity(nodeID)) {
            missingIDs.add(nodeID);
          }
        }
      }

      if (missingIDs.size) {
        map.redrawEnabled = false;           // block drawing
        context.container().call(loading);   // block ui

        // watch out: this callback may be called multiple times..
        const _missingEntitiesLoaded = (err, result) => {
          if (!err) {
            const visibleGroups = utilArrayGroupBy(result.data, 'visible');
            const visibles = visibleGroups.true ?? [];      // alive nodes
            const invisibles = visibleGroups.false ?? [];   // deleted nodes

            // Visible (not deleted) entities can be merged directly in..
            if (visibles.length) {
              for (const visible of visibles) {
                missingIDs.delete(visible.id);
              }
              baseGraph.rebase(visibles, graphs, true);   // force = true
              this._tree.rebase(visibles, true);          // force = true
            }

            // Invisible (deleted) entities, need to go back a version to find them..
            for (const entity of invisibles) {
              osm.loadEntityVersion(entity.id, +entity.version - 1, _missingEntitiesLoaded);
            }
          }

          if (err ?? !missingIDs.size) {
            _finish();
          }
        };

        osm.loadMultiple(missingIDs, _missingEntitiesLoaded);
      }
    }

    if (!missingIDs.size) {
      _finish();
    }

  }


  /**
   * saveBackup
   * Backup the user's edits to a JSON string in localStorage.
   * This code runs occasionally as the user edits.
   * @return  `true` if a backup was saved
   */
  saveBackup() {
    const context = this.context;
    if (context.inIntro) return;               // Don't backup edits made in the walkthrough
    if (context.mode?.id === 'save') return;   // Edits made in save mode may be conflict resolutions
    if (this._canRestoreBackup) return;        // Wait to see if the user wants to restore other edits
    if (this._inTransition) return;            // Don't backup edits mid-transition
    if (this._inTransaction) return;           // Don't backup edits mid-transaction
    if (!this._mutex.locked()) return;         // Another browser tab owns the history

    const storage = context.systems.storage;
    const json = this.toJSON();
    if (json) {
      const success = storage.setItem(this._backupKey(), json);
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
   * Restore the user's backup from localStorage.
   * This happens when:
   * - The user chooses to "Restore my changes" from the restore screen
   */
  restoreBackup() {
    this._canRestoreBackup = false;

    if (!this._mutex.locked()) return;  // another browser tab owns the history

    const storage = this.context.systems.storage;
    const json = storage.getItem(this._backupKey());
    if (json) {
      this.fromJSON(json, true);
    }
  }


  /**
   * clearBackup
   * Remove any backup stored in localStorage.
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
    storage.removeItem(this._backupKey());

    // clear the changeset metadata associated with the saved history
    storage.removeItem('comment');
    storage.removeItem('hashtags');
    storage.removeItem('source');
  }


  /**
   * _backupKey
   * Generate a key used to store/retrieve backup edits.
   * It uses `window.location.origin` avoid conflicts with other instances of Rapid.
   */
  _backupKey() {
    return 'Rapid_' + window.location.origin + '_saved_history';
  }


  /**
   * _perform
   * Internal _perform that accepts both actions and eased time.
   * @param  {Array}       Array of Action functions to perform
   * @param  {number?}     Eased time, should be in the range [0..1]
   * @return {Difference}  Difference between before and after of `current` Edit
   */
  _perform(actions, t) {
    let graph = this._current.graph;
    for (const fn of actions) {
      if (typeof fn === 'function') {
        graph = fn(graph, t);
      }
    }

    this._current.graph = graph;
    return this._emitChangeEvents();
  }


  /**
   * _gatherSources
   * Get the sources used to make the `current` edit.
   * @param   {string|Object?} annotation - Rapid edits may optionally use an annotation that includes the data source used
   * @return  {Object}  sources Object containing `imagery`, `photos`, `data` properties
   */
  _gatherSources(annotation) {
    const context = this.context;

    const sources = {};
    const imageryUsed = context.systems.imagery.imageryUsed();
    if (imageryUsed.length)  {
      sources.imagery = imageryUsed;
    }

    const photosUsed = context.systems.photos.photosUsed();
    if (photosUsed.length) {
      sources.photos = photosUsed;
    }

    const customLayer = context.scene().layers.get('custom-data');
    const customDataUsed = customLayer?.dataUsed() ?? [];
    const rapidDataUsed = annotation?.dataUsed ?? [];
    const dataUsed = [...rapidDataUsed, ...customDataUsed];
    if (dataUsed.length) {
      sources.data = dataUsed;
    }

    return sources;
  }


  /**
   * _emitChangeEvents
   * Recalculate the differences and dispatch change events.
   * @return {Difference}  Difference between before and after of `current` Edit
   */
  _emitChangeEvents() {
    if (this._inTransaction) return;

    const base = this.base.graph;
    const stable = this.stable.graph;
    const current = this.current.graph;

    if (this._lastStable !== stable) {
      const stableDifference = new Difference(this._lastStable, stable);
      this._lastStable = stable;
      this._fullDifference = new Difference(base, stable);
      this.emit('historychange', stableDifference);
    }

    let currentDifference;
    if (this._lastCurrent !== current) {
      currentDifference = new Difference(this._lastCurrent, current);
      this._lastCurrent = current;
      this.emit('editchange', currentDifference);
    }

    return currentDifference;  // only one place in the code uses this return - split operation?
  }
}
