import { utilArrayUnion, utilArrayUniq } from '@rapid-sdk/util';

import { AbstractSystem } from './AbstractSystem';
import { actionDiscardTags } from '../actions/discard_tags';
import { actionMergeRemoteChanges } from '../actions/merge_remote_changes';
import { actionNoop } from '../actions/noop';
import { actionRevert } from '../actions/revert';
import { Graph } from './lib';



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

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._loadedSome = this._loadedSome.bind(this);
    this._uploadCallback = this._uploadCallback.bind(this);
  }


  /**
   * init
   * Called one time after all objects have been instantiated.
   */
  init() {
    this.context.dataLoaderSystem().get('discarded')
      .then(d => this._discardTags = d)
      .catch(() => { /* ignore */ });
  }


  /**
   * reset
   * Called after completing an edit session to reset any internal state
   */
  reset() {
    this.changeset = null;
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
    const osm = context.services.get('osm');
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
    const editSystem = context.editSystem();
    this._origChanges = editSystem.changes(actionDiscardTags(editSystem.difference(), this._discardTags));

    // First time, `perform` a no-op action.
    // Any conflict resolutions will be done as `replace`
    // Remember to pop this later if needed
    if (!tryAgain) {
      editSystem.perform(actionNoop());
    }

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
    const osm = context.services.get('osm');
    const editSystem = context.editSystem();
    const summary = editSystem.difference().summary();
    const graph = context.graph();

    this._localGraph = graph;
    this._remoteGraph = new Graph(editSystem.base(), true);

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

    if (err) {
      this._errors.push({
        msg: err.message || err.responseText,
        details: [ this.context.t('save.status_code', { code: err.status }) ]
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

    const osm = this.context.services.get('osm');
    if (osm && loadMoreIDs.size) {
      osm.loadMultiple(Array.from(loadMoreIDs), this._loadedSome);

    } else if (!this._toLoadIDs.size) {  // we have loaded everything, continue to the next step
      this._detectConflicts();
      this._tryUpload();
    }
  }


  // Test everything in `_toCheckIDs` for conflicts
  _detectConflicts() {
    const l10n = this.context.localizationSystem();
    const editSystem = this.context.editSystem();
    const osm = this.context.services.get('osm');
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

      editSystem.replace(actionSafe);

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
          { id: entityID, text: keepMine, action: () => editSystem.replace(actionForceLocal) },
          { id: entityID, text: keepTheirs, action: () => editSystem.replace(actionForceRemote) }
        ]
      });
    }


    function formatUser(d) {
      return '<a href="' + osm.userURL(d) + '" target="_blank">' + d + '</a>';
    }

    function entityName(entity) {
      return l10n.displayName(entity) || (l10n.displayType(entity.id) + ' ' + entity.id);
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
    const osm = context.services.get('osm');
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
      const editSystem = context.editSystem();
      const changes = editSystem.changes(actionDiscardTags(editSystem.difference(), this._discardTags));
      if (changes.modified.length || changes.created.length || changes.deleted.length) {
        this.emit('willAttemptUpload');
        osm.putChangeset(this.changeset, changes, this._uploadCallback);
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
        this.save(true, true);  // tryAgain = true, checkConflicts = true
      } else {
        this._errors.push({
          msg: err.message || err.responseText,
          details: [ this.context.t('save.status_code', { code: err.status }) ]
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
    this.context.flush();
  }


  _didResultInErrors() {
    this.context.editSystem().pop();
    this.emit('resultErrors', this._errors);
    this._endSave();
  }


  _didResultInConflicts() {
    this._conflicts.sort((a, b) => b.id.localeCompare(a.id));
    this.emit('resultConflicts', this.changeset, this._conflicts, this._origChanges);
    this._endSave();
  }


  _didResultInSuccess() {
    // delete the edit stack cached to local storage
    this.context.editSystem().clearSaved();
    this.emit('resultSuccess', this.changeset);

    // Add delay to allow for postgres replication iD#1646 iD#2678
    window.setTimeout(() => {
      this._endSave();
      this.context.flush();   // will call this.reset() and delete `this.changeset`
    }, 2500);
  }


  _endSave() {
    this._isSaving = false;
    this.emit('saveEnded');
  }


  cancelConflictResolution() {
    this.context.editSystem().pop();
  }


  processResolvedConflicts() {
    const editSystem = this.context.editSystem();

    for (const conflict of this._conflicts) {
      if (conflict.chosen === 1) {   // user chose "use theirs"
        const entity = this.context.hasEntity(conflict.id);
        if (entity?.type === 'way') {
          for (const child of utilArrayUniq(entity.nodes)) {
            editSystem.replace(actionRevert(child));
          }
        }
        editSystem.replace(actionRevert(conflict.id));
      }
    }

    this.save(true, false);  // tryAgain = true, checkConflicts = false
  }
}
