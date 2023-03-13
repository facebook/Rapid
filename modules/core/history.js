import { dispatch as d3_dispatch } from 'd3-dispatch';
import { easeLinear as d3_easeLinear } from 'd3-ease';
import { select as d3_select } from 'd3-selection';
import { utilArrayDifference, utilArrayGroupBy, utilArrayUnion, utilObjectOmit, utilSessionMutex } from '@rapid-sdk/util';

import { Graph } from './Graph';
import { Difference } from './Difference';
import { osmEntity } from '../osm/entity';
import { prefs } from './preferences';
import { Tree } from './Tree';
import { uiLoading } from '../ui/loading';
import { utilRebind } from '../util';


export function coreHistory(context) {
    var dispatch = d3_dispatch('reset', 'change', 'merge', 'restore', 'undone', 'redone', 'storage_error');
    var lock = utilSessionMutex('lock');

    // restorable if iD not open in another window/tab and a saved history exists in localStorage
    var _hasUnresolvedRestorableChanges = lock.lock() && !!prefs(getKey('saved_history'));

    var duration = 150;
    var _imageryUsed = [];
    var _photoOverlaysUsed = [];
    var _checkpoints = {};
    var _pausedGraph;
    var _stack;
    var _index;
    var _tree;


    // internal _act, accepts list of actions and eased time
    function _act(actions, t) {
        actions = Array.prototype.slice.call(actions);

        var annotation;
        if (typeof actions[actions.length - 1] !== 'function') {
            annotation = actions.pop();
        }

        var graph = _stack[_index].graph;
        for (var i = 0; i < actions.length; i++) {
            graph = actions[i](graph, t);
        }

        return {
            graph: graph,
            annotation: annotation,
            imageryUsed: _imageryUsed,
            photoOverlaysUsed: _photoOverlaysUsed,
            transform: context.projection.transform(),
            selectedIDs: context.selectedIDs()
        };
    }


    // internal _perform with eased time
    function _perform(args, t) {
        var previous = _stack[_index].graph;
        _stack = _stack.slice(0, _index + 1);
        var actionResult = _act(args, t);
        _stack.push(actionResult);
        _index++;
        return change(previous);
    }


    // internal _replace with eased time
    function _replace(args, t) {
        var previous = _stack[_index].graph;
        // assert(_index == _stack.length - 1)
        var actionResult = _act(args, t);
        _stack[_index] = actionResult;
        return change(previous);
    }


    // internal _overwrite with eased time
    function _overwrite(args, t) {
        var previous = _stack[_index].graph;
        if (_index > 0) {
            _index--;
            _stack.pop();
        }
        _stack = _stack.slice(0, _index + 1);
        var actionResult = _act(args, t);
        _stack.push(actionResult);
        _index++;
        return change(previous);
    }


    // determine difference and dispatch a change event
    function change(previous) {
        var difference = new Difference(previous, history.graph());
        if (!_pausedGraph) {
            dispatch.call('change', this, difference);
        }
        return difference;
    }


    // iD uses namespaced keys so multiple installations do not conflict
    function getKey(n) {
        return 'iD_' + window.location.origin + '_' + n;
    }


    var history = {

        graph: function() {
            return _stack[_index].graph;
        },


        tree: function() {
            return _tree;
        },


        base: function() {
            return _stack[0].graph;
        },


        peekAnnotation: function() {
            return _stack[_index].annotation;
        },


        peekAllAnnotations: function() {
            var result = [];
            for (var i = 0; i <= _index; i++) {
                if (_stack[i].annotation) {
                    result.push(_stack[i].annotation);
                }
            }
            return result;
        },


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
        merge: function(entities, seenIDs) {
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

          const graphs = _stack.map(state => state.graph);
          baseGraph.rebase(entities, graphs, false);
          _tree.rebase(entities, false);

          dispatch.call('merge', this, seenIDs);
        },


        perform: function() {
            // complete any transition already in progress
            d3_select(document).interrupt('history.perform');

            var transitionable = false;
            var action0 = arguments[0];

            if (arguments.length === 1 ||
                (arguments.length === 2 && (typeof arguments[1] !== 'function'))) {
                transitionable = !!action0.transitionable;
            }

            if (transitionable) {
                var origArguments = arguments;
                d3_select(document)
                    .transition('history.perform')
                    .duration(duration)
                    .ease(d3_easeLinear)
                    .tween('history.tween', function() {
                        return function(t) {
                            if (t < 1) _overwrite([action0], t);
                        };
                    })
                    .on('start', function() {
                        _perform([action0], 0);
                    })
                    .on('end interrupt', function() {
                        _overwrite(origArguments, 1);
                    });

            } else {
                return _perform(arguments);
            }
        },


        replace: function() {
            d3_select(document).interrupt('history.perform');
            return _replace(arguments, 1);
        },


        // Same as calling pop and then perform
        overwrite: function() {
            d3_select(document).interrupt('history.perform');
            return _overwrite(arguments, 1);
        },


        pop: function(n) {
            d3_select(document).interrupt('history.perform');

            var previous = _stack[_index].graph;
            if (isNaN(+n) || +n < 0) {
                n = 1;
            }
            while (n-- > 0 && _index > 0) {
                _index--;
                _stack.pop();
            }
            return change(previous);
        },


        // Back to the previous annotated state or _index = 0.
        undo: function() {
            d3_select(document).interrupt('history.perform');

            var previousStack = _stack[_index];
            var previous = previousStack.graph;
            while (_index > 0) {
                _index--;
                if (_stack[_index].annotation) break;
            }

            dispatch.call('undone', this, _stack[_index], previousStack);
            return change(previous);
        },


        // Forward to the next annotated state.
        redo: function() {
            d3_select(document).interrupt('history.perform');

            var previousStack = _stack[_index];
            var previous = previousStack.graph;
            var tryIndex = _index;
            while (tryIndex < _stack.length - 1) {
                tryIndex++;
                if (_stack[tryIndex].annotation) {
                    _index = tryIndex;
                    dispatch.call('redone', this, _stack[_index], previousStack);
                    break;
                }
            }

            return change(previous);
        },


        pauseChangeDispatch: function() {
            if (!_pausedGraph) {
                _pausedGraph = _stack[_index].graph;
            }
        },


        resumeChangeDispatch: function() {
            if (_pausedGraph) {
                var previous = _pausedGraph;
                _pausedGraph = null;
                return change(previous);
            }
        },


        undoAnnotation: function() {
            var i = _index;
            while (i >= 0) {
                if (_stack[i].annotation) return _stack[i].annotation;
                i--;
            }
        },


        redoAnnotation: function() {
            var i = _index + 1;
            while (i <= _stack.length - 1) {
                if (_stack[i].annotation) return _stack[i].annotation;
                i++;
            }
        },


        // Returns the entities from the active graph with bounding boxes
        // overlapping the given `extent`.
        intersects: function(extent) {
            return _tree.intersects(extent, _stack[_index].graph);
        },


        difference: function() {
            var base = _stack[0].graph;
            var head = _stack[_index].graph;
            return new Difference(base, head);
        },


        changes: function(action) {
            var base = _stack[0].graph;
            var head = _stack[_index].graph;

            if (action) {
                head = action(head);
            }

            var difference = new Difference(base, head);

            return {
                modified: difference.modified(),
                created: difference.created(),
                deleted: difference.deleted()
            };
        },


        hasChanges: function() {
            return this.difference().changes.size > 0;
        },


        imageryUsed: function(sources) {
            if (sources) {
                _imageryUsed = sources;
                return history;
            } else {
                var s = new Set();
                _stack.slice(1, _index + 1).forEach(function(state) {
                    state.imageryUsed.forEach(function(source) {
                        if (source !== 'Custom') {
                            s.add(source);
                        }
                    });
                });
                return Array.from(s);
            }
        },


        photoOverlaysUsed: function(sources) {
            if (sources) {
                _photoOverlaysUsed = sources;
                return history;
            } else {
                var s = new Set();
                _stack.slice(1, _index + 1).forEach(function(state) {
                    if (state.photoOverlaysUsed && Array.isArray(state.photoOverlaysUsed)) {
                        state.photoOverlaysUsed.forEach(function(photoOverlay) {
                            s.add(photoOverlay);
                        });
                    }
                });
                return Array.from(s);
            }
        },


        // save the current history state
        checkpoint: function(key) {
            _checkpoints[key] = {
                stack: _stack,
                index: _index
            };
            return history;
        },


        // restore history state to a given checkpoint or reset completely
        reset: function(key) {
          d3_select(document).interrupt('history.perform');

          if (key !== undefined && _checkpoints.hasOwnProperty(key)) {  // reset to given key
            const fromGraph = _stack[_index].graph;

            _stack = _checkpoints[key].stack;
            _index = _checkpoints[key].index;

            const toGraph = _stack[_index].graph;
            const difference = new Difference(fromGraph, toGraph);
            dispatch.call('reset');
            dispatch.call('change', this, difference);
            dispatch.call('restore');

          } else {  // full reset
            _stack = [{graph: new Graph()}];
            _index = 0;
            _tree = new Tree(_stack[0].graph);
            _checkpoints = {};
            dispatch.call('reset');
            dispatch.call('change');
            dispatch.call('restore');
          }

          return history;
        },


        // `toIntroGraph()` is used to export the intro graph used by the walkthrough.
        //
        // To use it:
        //  1. Start the walkthrough.
        //  2. Get to a "free editing" tutorial step
        //  3. Make your edits to the walkthrough map
        //  4. In your browser dev console run:
        //        `id.history().toIntroGraph()`
        //  5. This outputs stringified JSON to the browser console
        //  6. Copy it to `data/intro_graph.json` and prettify it in your code editor
        toIntroGraph: function() {
          let nextID = { n: 0, r: 0, w: 0 };
          let permIDs = {};
          let graph = this.graph();
          let result = new Map;   // Map(entityID -> Entity)

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
          for (let entity of result.values()) {
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

        },


        //
        //
        //
        toJSON: function() {
          if (!this.hasChanges()) return;

          const modifiedEntities = new Map();  // Map(Entity.key -> Entity)
          const allEntityIDs = new Set();
          const stackData = [];

          // Preserve the users stack of edits..
          for (const s of _stack) {
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
            if (modified.length)      item.modified = modified;
            if (deleted.length)       item.deleted = deleted;
            if (s.imageryUsed)        item.imageryUsed = s.imageryUsed;
            if (s.photoOverlaysUsed)  item.photoOverlaysUsed = s.photoOverlaysUsed;
            if (s.annotation)         item.annotation = s.annotation;
            if (s.transform)          item.transform = s.transform;
            if (s.selectedIDs)        item.selectedIDs = s.selectedIDs;
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
            index: _index,
            timestamp: (new Date()).getTime()
          });
        },


        //
        //
        //
        fromJSON: function(json, loadChildNodes) {
          const baseGraph = this.base();   // The initial unedited graph
          const hist = JSON.parse(json);
          let loadComplete = true;

          osmEntity.id.next = hist.nextIDs;
          _index = hist.index;

          if (hist.version !== 2 && hist.version !== 3) {
            throw new Error(`History version ${hist.version} not supported.`);
          }

          // Instantiate the modified entities
          const modifiedEntities = new Map;  // Map(Entity.key -> Entity)
          for (const e of hist.entities) {
            modifiedEntities.set(osmEntity.key(e), osmEntity(e));
          }

          if (hist.version >= 3) {
            // If v3+, instantiate base entities too.
            const baseEntities = hist.baseEntities.map(e => osmEntity(e));

            // Merge originals into base graph, note that the force parameter is `true` here
            // to replace any that might have been loaded from the API.
            const graphs = _stack.map(s => s.graph);
            baseGraph.rebase(baseEntities, graphs, true);
            _tree.rebase(baseEntities, true);

            // When we restore a modified way, we also need to fetch any missing
            // childnodes that would normally have been downloaded with it.. #2142
            if (loadChildNodes) {
              const osm = context.connection();
              const baseWays = baseEntities.filter(entity => entity.type === 'way');
              const nodeIDs = baseWays.reduce(function(acc, way) { return utilArrayUnion(acc, way.nodes); }, []);
              let missing = nodeIDs.filter(nodeID => !baseGraph.hasEntity(nodeID));

              if (missing.length && osm) {
                loadComplete = false;
                context.map().redrawEnabled = false;

                const loading = uiLoading(context).blocking(true);
                context.container().call(loading);

                var _childNodesLoaded = function(err, result) {
                  if (!err) {
                    const visibleGroups = utilArrayGroupBy(result.data, 'visible');
                    const visibles = visibleGroups.true || [];      // alive nodes
                    const invisibles = visibleGroups.false || [];   // deleted nodes

                    if (visibles.length) {
                      const visibleIDs = visibles.map(entity => entity.id);
                      const graphs = _stack.map(s => s.graph);
                      missing = utilArrayDifference(missing, visibleIDs);
                      baseGraph.rebase(visibles, graphs, true);   // force = true
                      _tree.rebase(visibles, true);               // force = true
                    }

                    // fetch older versions of nodes that were deleted..
                    invisibles.forEach(function(entity) {
                      osm.loadEntityVersion(entity.id, +entity.version - 1, _childNodesLoaded);
                    });
                  }

                  if (err || !missing.length) {
                    loading.close();
                    context.map().redrawEnabled = true;
                    dispatch.call('change');
                    dispatch.call('restore', this);
                  }
                };

                osm.loadMultiple(missing, _childNodesLoaded);
              }
            }
          }   // end v3+


          // Replace the history stack.
          _stack = hist.stack.map((s, index) => {
            // Leave base graph alone, this first entry should have nothing in it.
            if (index === 0) return _stack[0];

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
            if (s.annotation && s.annotation.type === 'rapid_accept_feature') {
              const rapidContext = context.rapidContext();
              const sourceTag = s.annotation.source;
              rapidContext.sources.add('mapwithai');      // always add 'mapwithai'
              if (sourceTag && /^esri/.test(sourceTag)) {
                rapidContext.sources.add('esri');       // add 'esri' for esri sources
              }
            }

            return {
              graph: new Graph(baseGraph).load(entities),
              annotation: s.annotation,
              imageryUsed: s.imageryUsed,
              photoOverlaysUsed: s.photoOverlaysUsed,
              transform: s.transform,
              selectedIDs: s.selectedIDs
            };
          });


          const transform = _stack[_index].transform;
          if (transform) {
            context.map().transform(transform);
          }

          if (loadComplete) {
            dispatch.call('change');
            dispatch.call('restore', this);
          }

          return history;
        },


        lock: function() {
            return lock.lock();
        },


        unlock: function() {
            lock.unlock();
        },


        save: function() {
            if (lock.locked() &&
                // don't overwrite existing, unresolved changes
                !_hasUnresolvedRestorableChanges) {
                const success = prefs(getKey('saved_history'), history.toJSON() || null);

                if (!success) dispatch.call('storage_error');
            }
            return history;
        },


        // delete the history version saved in localStorage
        clearSaved: function() {
            context.debouncedSave.cancel();
            if (lock.locked()) {
                _hasUnresolvedRestorableChanges = false;
                prefs(getKey('saved_history'), null);

                // clear the changeset metadata associated with the saved history
                prefs('comment', null);
                prefs('hashtags', null);
                prefs('source', null);
            }
            return history;
        },


        savedHistoryJSON: function() {
            return prefs(getKey('saved_history'));
        },


        hasRestorableChanges: function() {
            return _hasUnresolvedRestorableChanges;
        },


        // load history from a version stored in localStorage
        restore: function() {
            if (lock.locked()) {
                _hasUnresolvedRestorableChanges = false;
                var json = this.savedHistoryJSON();
                if (json) history.fromJSON(json, true);
            }
        },


        _getKey: getKey

    };


    history.reset();

    return utilRebind(history, dispatch, 'on');
}
