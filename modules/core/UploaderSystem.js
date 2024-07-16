import { utilArrayUnion, utilArrayUniq } from '@rapid-sdk/util';

import { AbstractSystem } from './AbstractSystem.js';
import { actionDiscardTags } from '../actions/discard_tags.js';
import { actionMergeRemoteChanges } from '../actions/merge_remote_changes.js';
import { actionRevert } from '../actions/revert.js';
import { Graph } from './lib/index.js';



/**
 * `UploaderSystem` handles the process of submitting a changeset to OSM
 *  and dealing with any conflicts that might occur
 *
 * Events available:
 *   // Start and end events are dispatched exactly once each per legitimate outside call to `save`
 *   'saveStarted'        // dispatched as soon as a call to `save` has been deemed legitimate
 *   'saveEnded'          // dispatched after the result event has been dispatched
 *   'willAttemptUpload'  // dispatched before the actual upload call occurs, if it will
 *   'progressChanged'
 *
 *   // Each save results in one of these outcomes:
 *   'resultNoChanges'   // upload wasn't attempted since there were no edits
 *   'resultErrors'      // upload failed due to errors
 *   'resultConflicts'   // upload failed due to data conflicts
 *   'resultSuccess'     // upload completed without errors
 */
export class UploaderSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'uploader';
    this.dependencies = new Set(['assets', 'editor', 'l10n']);

    this.changeset = null;    // uiCommit will create it

    this._origChanges = null;
    this._discardTags = {};
    this._isSaving = false;

    // variables for conflict checking
    this._localGraph = null;
    this._remoteGraph = null;
    this._toCheckIDs = new Set();
    this._toLoadIDs = new Set();
    this._loadedIDs = new Set();
    this._conflicts = [];
    this._errors = [];
    this._initPromise = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._loadedSome = this._loadedSome.bind(this);
    this._uploadCallback = this._uploadCallback.bind(this);
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

    const assets = this.context.systems.assets;
    const prerequisites = assets.initAsync();

    return this._initPromise = prerequisites
      .then(() => assets.loadAssetAsync('tagging_discarded'))
      .then(d => this._discardTags = d);
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
    this.changeset = null;
    return Promise.resolve();
  }


  /**
   * isSaving
   */
  isSaving() {
    return this._isSaving;
  }


  /**
   * save
   */
  save(tryAgain, checkConflicts) {
    // Guard against accidentally entering save code twice - iD#4641
    if (this._isSaving && !tryAgain) return;

    const context = this.context;
    const osm = context.services.osm;
    if (!osm) return;

    // If user somehow got logged out mid-save, try to reauthenticate..
    // This can happen if they were logged in from before, but the tokens are no longer valid.
    if (!osm.authenticated()) {
      osm.authenticate(err => {
        if (!err) {
          this.save(tryAgain, checkConflicts);  // continue where we left off..
        }
      });
      return;
    }

    if (!this._isSaving) {
      this._isSaving = true;
      this.emit('saveStarted');
    }

    // reset variables
    this._localGraph = null;
    this._remoteGraph = null;
    this._toCheckIDs = new Set();
    this._toLoadIDs = new Set();
    this._loadedIDs = new Set();
    this._conflicts = [];
    this._errors = [];

    // Store original changes, in case user wants to download them as an .osc file
    const editor = context.systems.editor;
    this._origChanges = editor.changes(actionDiscardTags(editor.difference(), this._discardTags));

    // Attempt a fast upload first.. If there are conflicts, re-enter with `checkConflicts = true`
    if (!checkConflicts) {
      this._tryUpload();
    } else {
      this._startConflictCheck();
    }
  }


  /**
   * _startConflictCheck
   */
  _startConflictCheck() {
    const context = this.context;
    const osm = context.services.osm;
    const editor = context.systems.editor;
    const summary = editor.difference().summary();
    const graph = editor.staging.graph;

    this._localGraph = graph;
    this._remoteGraph = new Graph(editor.base.graph, true);

    // Gather entityIDs to check
    // We will load these from the OSM API into the `remoteGraph`
    this._toCheckIDs = new Set();

    for (const [entityID, item] of summary) {
      if (item.changeType === 'modified') {
        const entity = graph.entity(entityID);
        this._toCheckIDs.add(entityID);   // The modified entity

        for (const child of graph.childNodes(entity)) {  // and any children
          if (child.version !== undefined) {
            this._toCheckIDs.add(child.id);
          }
        }
      }
    }

    this._toLoadIDs = new Set(this._toCheckIDs);
    this._loadedIDs = new Set();

    if (osm && this._toLoadIDs.size) {
      this.emit('progressChanged', this._loadedIDs.size, this._toCheckIDs.size);
      osm.loadMultiple(Array.from(this._toLoadIDs), this._loadedSome);
    } else {
      this._tryUpload();
    }
  }


  // `loadedSome` callback may be called multiple times.
  // Here we load a batch of remote entities into `remoteGraph`,
  // then expand the search set if needed and schedule more loading.
  _loadedSome(err, result) {
    if (this._errors.length) return;   // give up if there are errors

    const l10n = this.context.systems.l10n;
    const osm = this.context.services.osm;

    if (err) {
      this._errors.push({
        msg: err.message || err.responseText,
        details: [ l10n.t('save.status_code', { code: err.status }) ]
      });
      this._didResultInErrors();
      return;
    }

    let loadMoreIDs = new Set();

    for (const entity of result.data) {
      this._remoteGraph.replace(entity);
      this._loadedIDs.add(entity.id);
      this._toLoadIDs.delete(entity.id);

      if (!entity.visible) continue;

      // Because `loadMultiple` doesn't download `/full` like `loadEntity`,
      // expand `_toCheck` set to include children that aren't already being checked..
      if (entity.type === 'way') {
        for (const childID of entity.nodes) {
          if (!this._toCheckIDs.has(childID)) {
            this._toCheckIDs.add(childID);
            this._toLoadIDs.add(childID);
            loadMoreIDs.add(childID);
          }
        }
      } else if (entity.type === 'relation' && entity.isMultipolygon()) {
        for (const member of entity.members) {
          if (!this._toCheckIDs.has(member.id)) {
            this._toCheckIDs.add(member.id);
            this._toLoadIDs.add(member.id);
            loadMoreIDs.add(member.id);
          }
        }
      }
    }

    this.emit('progressChanged', this._loadedIDs.size, this._toCheckIDs.size);

    if (osm && loadMoreIDs.size) {
      osm.loadMultiple(Array.from(loadMoreIDs), this._loadedSome);

    } else if (!this._toLoadIDs.size) {  // we have loaded everything, continue to the next step
      this._detectConflicts();
      this._tryUpload();
    }
  }


  // Test everything in `_toCheckIDs` for conflicts
  _detectConflicts() {
    const context = this.context;
    const l10n = context.systems.l10n;
    const editor = context.systems.editor;
    const osm = context.services.osm;
    if (!osm) return;

    const localGraph = this._localGraph;
    const remoteGraph = this._remoteGraph;

    for (const entityID of this._toCheckIDs) {
      const local = localGraph.entity(entityID);
      const remote = remoteGraph.entity(entityID);

      if (sameVersions(local, remote)) continue;

      // Try a safe merge first
      const actionSafe = actionMergeRemoteChanges(entityID, {
        localGraph: localGraph,
        remoteGraph: remoteGraph,
        discardTags: this._discardTags,
        formatUser: formatUser,
        localize: l10n.t,
        strategy: 'safe'
      });

      editor.perform(actionSafe);

      const mergeConflicts = actionSafe.conflicts();
      if (!mergeConflicts.length) continue;  // merged safely

      // present options for destructive merging
      const actionForceLocal = actionMergeRemoteChanges(entityID, {
        localGraph: localGraph,
        remoteGraph: remoteGraph,
        discardTags: this._discardTags,
        formatUser: formatUser,
        localize: l10n.t,
        strategy: 'force_local'
      });

      const actionForceRemote = actionMergeRemoteChanges(entityID, {
        localGraph: localGraph,
        remoteGraph: remoteGraph,
        discardTags: this._discardTags,
        formatUser: formatUser,
        localize: l10n.t,
        strategy: 'force_remote'
      });

      const keepMine = l10n.t('save.conflict.' + (remote.visible ? 'keep_local' : 'restore'));
      const keepTheirs = l10n.t('save.conflict.' + (remote.visible ? 'keep_remote' : 'delete'));

      this._conflicts.push({
        id: entityID,
        name: entityName(local),
        details: mergeConflicts,
        chosen: 1,
        choices: [
          { id: entityID, text: keepMine, action: () => editor.perform(actionForceLocal) },
          { id: entityID, text: keepTheirs, action: () => editor.perform(actionForceRemote) }
        ]
      });
    }


    function formatUser(d) {
      return '<a href="' + osm.userURL(d) + '" target="_blank">' + d + '</a>';
    }

    function entityName(entity) {
      return l10n.displayName(entity.tags) || (l10n.displayType(entity.id) + ' ' + entity.id);
    }

    function sameVersions(local, remote) {
      if (local.version !== remote.version) return false;
      if (local.type === 'way') {
        for (const childID of utilArrayUnion(local.nodes, remote.nodes)) {
          const a = localGraph.hasEntity(childID);
          const b = remoteGraph.hasEntity(childID);
          if (a && b && a.version !== b.version) return false;
        }
      }
      return true;
    }

  }


  // This is called when we are ready to attempt a changeset upload.
  // If conflicts or errors exist, present them to the user instead.
  _tryUpload() {
    const context = this.context;
    const osm = context.services.osm;
    if (!osm) {
      this._errors.push({ msg: 'No OSM Service' });
    }
    if (!this.changeset) {  // shouldn't happen
      this._errors.push({ msg: 'No OSM Changeset' });
    }

    if (this._conflicts.length) {
      this._didResultInConflicts();

    } else if (this._errors.length) {
      this._didResultInErrors();

    } else {
      const editor = context.systems.editor;
      const changes = editor.changes(actionDiscardTags(editor.difference(), this._discardTags));
      if (changes.modified.length || changes.created.length || changes.deleted.length) {
        this.emit('willAttemptUpload');
        osm.sendChangeset(this.changeset, changes, this._uploadCallback);
      } else {
        // changes were insignificant or reverted by user
        this._didResultInNoChanges();
      }
    }
  }


  _uploadCallback(err, updatedChangeset) {
    if (updatedChangeset) {
      this.changeset = updatedChangeset;  // it may have a changeset id now
    }

    if (err) {
      if (err.status === 409) {  // 409 Conflict
        this.save(true, true);   // tryAgain = true, checkConflicts = true
      } else {
        const l10n = this.context.systems.l10n;
        this._errors.push({
          msg: err.message || err.responseText,
          details: [ l10n.t('save.status_code', { code: err.status }) ]
        });
        this._didResultInErrors();
      }

    } else {
      this._didResultInSuccess();
    }
  }


  _didResultInNoChanges() {
    this.emit('resultNoChanges');
    this._endSave();
  }


  _didResultInErrors() {
    // this.context.systems.editor.pop();
    const editor = this.context.systems.editor;
    editor.revert();
    this.emit('resultErrors', this._errors);
    this._endSave();
  }


  _didResultInConflicts() {
    this._conflicts.sort((a, b) => b.id.localeCompare(a.id));
    this.emit('resultConflicts', this.changeset, this._conflicts, this._origChanges);
    this._endSave();
  }


  _didResultInSuccess() {
    this.emit('resultSuccess', this.changeset);
    this._endSave();
  }


  _endSave() {
    this._isSaving = false;
    this.emit('saveEnded');
  }


  cancelConflictResolution() {
    // this.context.systems.editor.pop();
    const editor = this.context.systems.editor;
    editor.revert();
  }


  processResolvedConflicts() {
    const editor = this.context.systems.editor;

    for (const conflict of this._conflicts) {
      if (conflict.chosen === 1) {   // user chose "use theirs"
        const graph = editor.staging.graph;
        const entity = graph.hasEntity(conflict.id);
        if (entity?.type === 'way') {
          for (const child of utilArrayUniq(entity.nodes)) {
            editor.perform(actionRevert(child));
          }
        }
        editor.perform(actionRevert(conflict.id));
      }
    }

    this.save(true, false);  // tryAgain = true, checkConflicts = false
  }
}
