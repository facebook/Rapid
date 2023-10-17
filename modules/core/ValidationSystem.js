import { Extent } from '@rapid-sdk/math';
import { utilArrayChunk, utilArrayGroupBy, utilEntityAndDeepMemberIDs } from '@rapid-sdk/util';

import { AbstractSystem } from './AbstractSystem';
import { Difference } from './lib/Difference';
import * as Validations from '../validations/index';

const RETRY = 5000;    // wait 5 sec before revalidating provisional entities


/**
 * `ValidationSystem` manages all the validation rules and maintains two caches
 * containing the validation results:
 *   `base` is the results of validating the base graph (before user edits)
 *   `head` is the results of validating the head graph (with user edits applied)
 *
 * We do both because that's the only way to know whether to credit a user with
 * fixing something (or breaking it).  This means that every feaature downloaded
 * from OSM gets validated.  This system maintains a work queue so that validation
 * is performed in the background during browser idle times.
 *
 * It would be even better to do this in a worker process, but workers don't
 * have easy access to things like the Graph or Edits/History.
 *
 * Events available:
 *   `validated`     Fires after some validation has occurred
 */
export class ValidationSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  context  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'validator';
    this.dependencies = new Set(['editor', 'storage', 'map', 'urlhash']);

    this._rules = new Map();    // Map(ruleID -> validator)
    this._base = new ValidationCache('base');   // issues before any user edits
    this._head = new ValidationCache('head');   // issues after all user edits

    this._disabledRuleIDs = new Set();
    this._ignoredIssueIDs = new Set();
    this._resolvedIssueIDs = new Set();
    this._completeDiff = new Map();    // complete diff base -> head of what the user changed
    this._headIsStable = false;
    this._deferredRIC = new Map();   // Deferred `requestIdleCallback` - Map(handle -> Promise.reject)
    this._deferredST = new Set();    // Deferred `setTimeout` - Set(handles)
    this._errorOverrides = [];
    this._warningOverrides = [];
    this._disableOverrides = [];

    this._initPromise = null;
    this._validationPromise = null;    // Promise fulfilled when validation caught up to `stable` snapshot

    // Ensure methods used as callbacks always have `this` bound correctly.
    this.validateAsync = this.validateAsync.bind(this);
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

    // Create the validation rules
    const context = this.context;
    Object.values(Validations).forEach(validation => {
      if (typeof validation !== 'function') return;
      const fn = validation(context);
      this._rules.set(fn.type, fn);
    });

    // Init prerequisites
    const editor = context.systems.editor;
    const storage = context.systems.storage;
    const urlhash = context.systems.urlhash;
    const prerequisites = Promise.all([
      editor.initAsync(),
      storage.initAsync(),
      urlhash.initAsync()
    ]);

    return this._initPromise = prerequisites
      .then(() =>  {
        // Allow validation severity to be overridden by url queryparams...
        // See: https://github.com/openstreetmap/iD/pull/8243
        //
        // Each param should contain a urlencoded comma separated list of
        //  `type/subtype` rules.  `*` may be used as a wildcard..
        // Examples:
        //  `validationError=disconnected_way/*`
        //  `validationError=disconnected_way/highway`
        //  `validationError=crossing_ways/bridge*`
        //  `validationError=crossing_ways/bridge*,crossing_ways/tunnel*`
        this._errorOverrides = this._parseHashParam(urlhash.initialHashParams.get('validationError'));
        this._warningOverrides = this._parseHashParam(urlhash.initialHashParams.get('validationWarning'));
        this._disableOverrides = this._parseHashParam(urlhash.initialHashParams.get('validationDisable'));

        const disabledRules = storage.getItem('validate-disabledRules');
        if (disabledRules) {
          const ruleIDs = disabledRules.split(',').map(s => s.trim()).filter(Boolean);
          this._disabledRuleIDs = new Set(ruleIDs);
        }

        // register event handlers:

    // todo: find another way to reset this
    //      .on('reset', () => {            // on reset - happens after save, or enter/exit walkthrough
    //        this.reset(false);   // cached issues aren't valid any longer if the history has been reset
    //        this.validateAsync();
    //      });

        // WHEN TO RUN VALIDATION:
        editor
          .on('historychange', () => this.validateAsync())
          .on('merge', entityIDs => this._validateBaseEntitiesAsync(entityIDs));
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
    this._reset(true);
    return Promise.resolve();
  }


  /**
   * _parseHashParam
   * Converts hash parameters for severity overrides to regex matchers
   * @param   {String}  val  - The value retrieved, e.g. `crossing_ways/bridge*,crossing_ways/tunnel*`
   * @return  {Array}   Array of Objects like { type: RegExp, subtype: RegExp }
   */
  _parseHashParam(val = '') {
    let result = [];
    const rules = val.split(',').map(s => s.trim()).filter(Boolean);
    for (const rule of rules) {
      const parts = rule.split('/', 2);  // "type/subtype"
      const type = parts[0];
      const subtype = parts[1] ?? '*';
      if (!type || !subtype) continue;
      result.push({ type: makeRegExp(type), subtype: makeRegExp(subtype) });
    }
    return result;

    function makeRegExp(str) {
      const escaped = str
        .replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&')   // escape all reserved chars except for the '*'
        .replace(/\*/g, '.*');                      // treat a '*' like '.*'
      return new RegExp(`^${escaped}$`);
    }
  }


  /**
   * _reset
   * Cancels deferred work and resets all caches
   * @param  {boolean}  resetIgnored    `true` to also clear the list of user-ignored issues
   */
  _reset(resetIgnored = false) {
    // empty queues
    this._base.queue = [];
    this._head.queue = [];

    // cancel deferred work and reject any pending promise
    for (const [handle, reject] of this._deferredRIC) {
      window.cancelIdleCallback(handle);
      reject();
    }
    this._deferredRIC.clear();

    for (const handle of this._deferredST) {
      window.clearTimeout(handle);
    }
    this._deferredST.clear();

    // clear caches
    if (resetIgnored) this._ignoredIssueIDs.clear();
    this._resolvedIssueIDs.clear();
    this._base = new ValidationCache('base');
    this._head = new ValidationCache('head');
    this._completeDiff = new Map();
    this._headIsStable = false;
  }



  /**
   * resetIgnoredIssues
   * Clears out the `_ignoredIssueIDs` Set
   */
  resetIgnoredIssues() {
    this._ignoredIssueIDs.clear();
    this.emit('validated');   // redraw UI
  }


  /**
   * revalidateUnsquare
   * Called whenever the user changes the unsquare threshold
   * It reruns just the "unsquare_way" validation on all buildings.
   */
  revalidateUnsquare() {
    const checkUnsquareWay = this._rules.get('unsquare_way');
    if (typeof checkUnsquareWay !== 'function') return;

    const revalidate = (cache) => {
      if (!cache.graph) return;

      cache.uncacheIssuesOfType('unsquare_way');   // uncache existing

      // rerun for all buildings
      const tree = this.context.systems.editor.tree;
      const buildings = tree.intersects(new Extent([-180,-90],[180, 90]), cache.graph)  // everywhere
        .filter(entity => (entity.type === 'way' && entity.tags.building && entity.tags.building !== 'no'));

      for (const entity of buildings) {
        const detected = checkUnsquareWay(entity, cache.graph);
        if (!detected.length) continue;
        cache.cacheIssues(detected);
      }
    };

    revalidate(this._head);
    revalidate(this._base);
    this.emit('validated');
  }


  /**
   * getIssues
   * Gets all issues that match the given options
   * This is called by many other places
   *
   * @param {Object} options - Object containing:
   *   {
   *     what: 'all',                  // 'all' or 'edited'
   *     where: 'all',                 // 'all' or 'visible'
   *     includeIgnored: false,        // true, false, or 'only'
   *     includeDisabledRules: false   // true, false, or 'only'
   *   }
   *
   * @return  {Array}  An Array containing the issues
   */
  getIssues(options) {
    // Note that we use `current.graph` here, not `cache.graph`,
    // because that is the graph that the calling code will be using.
    const opts = Object.assign({ what: 'all', where: 'all', includeIgnored: false, includeDisabledRules: false }, options);
    const context = this.context;
    const view = context.systems.map.extent();
    const graph = context.systems.editor.current.graph;
    let seen = new Set();
    let results = [];

    // Filter the issue set to include only what the calling code wants to see.
    const filter = (issue) => {
      if (!issue) return false;
      if (seen.has(issue.id)) return false;
      if (this._resolvedIssueIDs.has(issue.id)) return false;
      if (opts.includeDisabledRules === 'only' && !this._disabledRuleIDs.has(issue.type)) return false;
      if (!opts.includeDisabledRules && this._disabledRuleIDs.has(issue.type)) return false;

      if (opts.includeIgnored === 'only' && !this._ignoredIssueIDs.has(issue.id)) return false;
      if (!opts.includeIgnored && this._ignoredIssueIDs.has(issue.id)) return false;

      // This issue may involve an entity that doesn't exist in `current.graph`.
      // This can happen because validation is async and rendering the issue lists is async.
      if ((issue.entityIds || []).some(id => !graph.hasEntity(id))) return false;

      if (opts.where === 'visible') {
        const extent = issue.extent(graph);
        if (!view.intersects(extent)) return false;
      }

      return true;
    };


    // collect head issues - present in the user edits
    if (this._head.graph && this._head.graph !== this._base.graph) {
      const issues = [ ...this._head.issues.values() ];
      for (const issue of issues) {
        // In the head cache, only count features that the user is responsible for - iD#8632
        // For example, a user can undo some work and an issue will still present in the
        // head graph, but we don't want to credit the user for causing that issue.
        const userModified = (issue.entityIds || []).some(entityID => this._completeDiff.has(entityID));
        if (opts.what === 'edited' && !userModified) continue;   // present in head but user didn't touch it

        if (!filter(issue)) continue;
        seen.add(issue.id);
        results.push(issue);
      }
    }

    // collect base issues - present before user edits
    if (opts.what === 'all') {
      const issues = [ ...this._base.issues.values() ];
      for (const issue of issues) {
        if (!filter(issue)) continue;
        seen.add(issue.id);
        results.push(issue);
      }
    }

    return results;
  }


  /**
   * getResolvedIssues
   * Gets the issues that have been fixed by the user.
   * Resolved issues are tracked in the `_resolvedIssueIDs` Set,
   * and they should all be issues that exist in the base cache.
   * @return  {Array}  An Array containing the issues
   */
  getResolvedIssues() {
    return Array.from(this._resolvedIssueIDs)
      .map(issueID => this._base.issues.get(issueID))
      .filter(Boolean);
  }


  /**
   * focusIssue
   * Adjusts the map to focus on the given issue.
   * (requires the issue to have a reasonable extent defined)
   * @param  {ValidationIssue}  The Issue to focus on
   */
  focusIssue(issue) {
    // Note that we use `current.graph` here, not `cache.graph`,
    // because that is the graph that the calling code will be using.
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.current.graph;
    const map = context.systems.map;
    let selectID;
    let focusCenter;

    // Try to focus the map at the center of the issue..
    const issueExtent = issue.extent(graph);
    if (issueExtent) {
      focusCenter = issueExtent.center();
    }

    // Try to select the first entity in the issue..
    if (issue.entityIds && issue.entityIds.length) {
      selectID = issue.entityIds[0];

      // If a relation, focus on one of its members instead.
      // Otherwise we might be focusing on a part of map where the relation is not visible.
      if (selectID && selectID.charAt(0) === 'r') {   // relation
        const ids = utilEntityAndDeepMemberIDs([selectID], graph);
        let nodeID = ids.find(id => id.charAt(0) === 'n' && graph.hasEntity(id));

        if (!nodeID) {  // relation has no downloaded nodes to focus on
          const wayID = ids.find(id => id.charAt(0) === 'w' && graph.hasEntity(id));
          if (wayID) {
            nodeID = graph.entity(wayID).first();   // focus on the first node of this way
          }
        }

        if (nodeID) {
          focusCenter = graph.entity(nodeID).loc;
        }
      }
    }

    if (focusCenter) {  // Adjust the view
      const setZoom = Math.max(map.zoom(), 19);
      map.centerZoomEase(focusCenter, setZoom);
    }

    if (selectID) {  // Enter select mode
      window.setTimeout(() => {
        context.enter('select-osm', { selection: { osm: [selectID] }} );
        this.emit('focusedIssue', issue);
      }, 250);  // after ease
    }
  }


  /**
   * getIssuesBySeverity
   * Gets the issues then groups them by error/warning
   * (This just calls `getIssues`, then puts issues in groups)
   *
   * @param   {Object}  options - see `getIssues`
   * @return  {Object}  result like:
   *   {
   *     error:    Array of errors,
   *     warning:  Array of warnings
   *   }
   */
  getIssuesBySeverity(options) {
    let groups = utilArrayGroupBy(this.getIssues(options), 'severity');
    groups.error = groups.error ?? [];
    groups.warning = groups.warning ?? [];
    return groups;
  }


  /**
   * getSharedEntityIssues
   * Gets the issues that the given entityIDs have in common, matching the given options
   * (This just calls `getIssues`, then filters for the given entity IDs)
   * The issues are sorted for relevance
   *
   * @param   {Array|Set}  entityIDs - Array or Set of entityIDs to get issues for
   * @param   {Object}     options   - See `getIssues`
   * @return  {Array}   An Array containing the issues
   */
  getSharedEntityIssues(entityIDs, options) {
    const orderedIssueTypes = [                 // Show some issue types in a particular order:
      'missing_tag', 'missing_role',            // - missing data first
      'outdated_tags', 'mismatched_geometry',   // - identity issues
      'crossing_ways', 'almost_junction',       // - geometry issues where fixing them might solve connectivity issues
      'disconnected_way', 'impossible_oneway'   // - finally connectivity issues
    ];

    const allIssues = this.getIssues(options);
    const forEntityIDs = new Set(entityIDs);

    return allIssues
      .filter(issue => (issue.entityIds ?? []).some(entityID => forEntityIDs.has(entityID)))
      .sort((issue1, issue2) => {
        if (issue1.type === issue2.type) {             // issues of the same type, sort deterministically
          return issue1.id < issue2.id ? -1 : 1;
        }
        const index1 = orderedIssueTypes.indexOf(issue1.type);
        const index2 = orderedIssueTypes.indexOf(issue2.type);
        if (index1 !== -1 && index2 !== -1) {          // both issue types have explicit sort orders
          return index1 - index2;
        } else if (index1 === -1 && index2 === -1) {   // neither issue type has an explicit sort order, sort by type
          return issue1.type < issue2.type ? -1 : 1;
        } else {                                       // order explicit types before everything else
          return index1 !== -1 ? -1 : 1;
        }
      });
  }


  /**
   * getEntityIssues
   * This just calls `getSharedEntityIssues` for the given entityID
   *
   * @param   {string}  entityID - The entityID to get issues for
   * @param   {Object}  options  - See `getIssues`
   * @return  {Array}   An Array containing the issues
   */
  getEntityIssues(entityID, options) {
    return this.getSharedEntityIssues([entityID], options);
  }


  /**
   * getRuleKeys
   * @return  {Array}  An Array containing the rule keys
   */
  getRuleKeys() {
    return [...this._rules.keys()];
  }


  /**
   * isRuleEnabled
   * @param   {string}   ruleID  - The ruleID (e.g. 'crossing_ways')
   * @return  {boolean}  true/false
   */
  isRuleEnabled(ruleID) {
    return !this._disabledRuleIDs.has(ruleID);
  }


  /**
   * toggleRule
   * Toggles a single validation rule,
   * then reruns the validation so that the user sees something happen in the UI
   * @param  {string}  ruleID - The rule to toggle (e.g. 'crossing_ways')
   */
  toggleRule(ruleID) {
    if (this._disabledRuleIDs.has(ruleID)) {
      this._disabledRuleIDs.delete(ruleID);
    } else {
      this._disabledRuleIDs.add(ruleID);
    }

    const storage = this.context.systems.storage;
    storage.setItem('validate-disabledRules', [...this._disabledRuleIDs].join(','));
    this.validateAsync();
  }


  /**
   * disableRules
   * Disables given validation rules,
   * then reruns the validation so that the user sees something happen in the UI
   * @param   ruleIDs  Complete set of rules that should be disabled
   */
  disableRules(ruleIDs = []) {
    this._disabledRuleIDs = new Set(ruleIDs);

    const storage = this.context.systems.storage;
    storage.setItem('validate-disabledRules', [...this._disabledRuleIDs].join(','));
    this.validateAsync();
  }


  /**
   * ignoreIssue
   * Don't show the given issue in lists
   * @param  {string}  issueID - The issueID to ignore
   */
  ignoreIssue(issueID) {
    this._ignoredIssueIDs.add(issueID);
  }


  /**
   * validateAsync
   * Validates anything that has changed in the head graph since the last time it was run.
   * (head graph contains user's edits)
   * Returns a Promise fulfilled when the validation has completed and then emits a `validated` event.
   * This may take time but happen in the background during browser idle time.
   * @return  {Promise}  Promise fulfilled when validation is completed.
   */
  validateAsync() {
    const context = this.context;
    const editor = context.systems.editor;
    if (editor.canRestoreBackup) return Promise.resolve();   // Wait to see if the user wants to restore their backup

    // Make sure the caches have graphs assigned to them.
    // (We don't do this in `reset` because context is still resetting things and `base` is unstable then)
    const baseGraph = editor.base.graph;
    if (!this._head.graph) this._head.graph = baseGraph;
    if (!this._base.graph) this._base.graph = baseGraph;

    const prevGraph = this._head.graph;
    const headGraph = editor.stable.graph;

    if (headGraph === prevGraph) {   // this._head.graph is stable - we are caught up
      this._headIsStable = true;
      this.emit('validated');
      return Promise.resolve();
    }

    if (this._validationPromise) {    // Validation already in process, but we aren't caught up to `stable`
      this._headIsStable = false;     // We will need to catch up after the validation promise fulfills
      return this._validationPromise;
    }

    // If we get here, it's time to start validating stuff.
    this._head.graph = headGraph;  // take snapshot
    this._completeDiff = editor.difference().complete();
    const incrementalDiff = new Difference(prevGraph, headGraph);
    let entityIDs = [...incrementalDiff.complete().keys()];
    entityIDs = this._head.withAllRelatedEntities(entityIDs);  // expand set

    if (!entityIDs.size) {
      this.emit('validated');
      return Promise.resolve();
    }

    this._validationPromise = this._validateEntitiesAsync(entityIDs, this._head)
      .then(() => this._updateResolvedIssues(entityIDs))
      .then(() => this.emit('validated'))
      .catch(e => console.error(e))  // eslint-disable-line
      .then(() => {
        this._validationPromise = null;
        if (!this._headIsStable) {
          this.validateAsync();   // run it again to catch up to `stable` graph
        }
      });

    return this._validationPromise;
  }


  /**
   * _validateBaseEntitiesAsync
   * Validates new entities being merged into the base graph.
   * (base graph contains original map state, before user's edits)
   * This may take time but happen in the background during browser idle time.
   * @param   {Array|Set}  entityIDs - The entityIDs to validate
   * @return  {Promise}    Promise fulfilled when validation is completed.
   */
  _validateBaseEntitiesAsync(entityIDs) {
    const context = this.context;
    const editor = context.systems.editor;
    if (editor.canRestoreBackup) return Promise.resolve();   // Wait to see if the user wants to restore their backup
    if (!entityIDs) return Promise.resolve();

    // Make sure the caches have graphs assigned to them.
    // (We don't do this in `reset` because context is still resetting things and `base` is unstable then)
    const baseGraph = editor.base.graph;
    if (!this._head.graph) this._head.graph = baseGraph;
    if (!this._base.graph) this._base.graph = baseGraph;

    entityIDs = this._base.withAllRelatedEntities(entityIDs);  // expand set
    return this._validateEntitiesAsync(entityIDs, this._base);
  }


  /**
   * _validateEntity
   * Runs all validation rules on a single entity.
   * Some things to note:
   *  - Graph is passed in from whenever the validation was started.  Validators shouldn't use
   *    the current graph because this all happens async, and the graph might have changed
   *   (for example, nodes getting deleted before the validation can run)
   *  - Validator functions may still be waiting on something and return a "provisional" result.
   *    In this situation, we will schedule to revalidate the entity sometime later.
   *
   * @param  {Entity}  entity - The entity to validate
   * @param  {Graph}   graph  - The Graph containing the Entity
   * @return {Object}  Result like:
   *   {
   *     issues:       Array of detected issues
   *     provisional:  `true` if provisional result, `false` if final result
   *   }
   */
  _validateEntity(entity, graph) {

    // If there are any override rules that match the issue type/subtype,
    // adjust severity (or disable it) and keep/discard as quickly as possible.
    const applySeverityOverrides = (issue) => {
      const type = issue.type;
      const subtype = issue.subtype ?? '';

      for (const error of this._errorOverrides) {
        if (error.type.test(type) && error.subtype.test(subtype)) {
          issue.severity = 'error';
          return true;
        }
      }
      for (const warning of this._warningOverrides) {
        if (warning.type.test(type) && warning.subtype.test(subtype)) {
          issue.severity = 'warning';
          return true;
        }
      }
      for (const disable of this._disableOverrides) {
        if (disable.type.test(type) && disable.subtype.test(subtype)) {
          return false;
        }
      }
      return true;
    };


    const result = { issues: [], provisional: false };
    for (const [key, rule] of this._rules) {   // run all validators
      if (typeof rule !== 'function') {
        console.error(`no such validation rule = ${key}`);  // eslint-disable-line no-console
        continue;
      }
      let detected = rule(entity, graph);
      if (detected.provisional) {   // this validation should be run again later
        result.provisional = true;
      }

      detected = detected.filter(applySeverityOverrides);
      result.issues = result.issues.concat(detected);
    }

    return result;
  }


  /**
   * _updateResolvedIssues
   * Determine if any issues were resolved for the given entities.
   * This is called by `validateAsync()` after validation of the head graph
   *
   * Give the user credit for fixing an issue if:
   * - the issue is in the base cache
   * - the issue is not in the head cache
   * - the user did something to one of the entities involved in the issue
   *
   * @param  {Array|Set}  entityIDs - Array or Set containing entity IDs.
   */
  _updateResolvedIssues(entityIDs = []) {
    for (const entityID of entityIDs) {
      const issues = this._base.entityIssueIDs.get(entityID) ?? [];
      for (const issueID of issues) {
        // Check if the user did something to one of the entities involved in this issue.
        // (This issue could involve multiple entities, e.g. disconnected routable features)
        const issue = this._base.issues.get(issueID);
        const userModified = (issue?.entityIds || []).some(entityID => this._completeDiff.has(entityID));

        if (userModified && !this._head.issues.has(issueID)) {  // issue seems fixed
          this._resolvedIssueIDs.add(issueID);
        } else {                                   // issue still not resolved
          this._resolvedIssueIDs.delete(issueID);  // (did undo, or possibly fixed and then re-caused the issue)
        }
      }
    }
  }


  /**
   * _validateEntitiesAsync
   * Schedule validation for many entities.
   * This may take time but happen in the background during browser idle time.
   * @param  {Array|Set}        entityIDs - The entityIDs to validate
   * @param  {Graph}            graph     - The Graph to validate that contains those entities
   * @param  {ValidationCache}  cache     - The cache to store results in (`_head` or `_base`)
   * @return {Promise}  Promise fulfilled when the validation has completed.
   */
  _validateEntitiesAsync(entityIDs, cache) {
    // Enqueue the work
    const jobs = Array.from(entityIDs).map(entityID => {
      if (cache.queuedEntityIDs.has(entityID)) return null;  // queued already
      cache.queuedEntityIDs.add(entityID);

      // Clear caches for existing issues related to this entity
      cache.uncacheEntityID(entityID);

      return () => {
        cache.queuedEntityIDs.delete(entityID);

        const graph = cache.graph;
        if (!graph) return;  // was reset?

        const entity = graph.hasEntity(entityID);   // Sanity check: don't validate deleted entities
        if (!entity) return;

        // detect new issues and update caches
        const result = this._validateEntity(entity, graph);
        if (result.provisional) {                       // provisional result
          cache.provisionalEntityIDs.add(entityID);     // we'll need to revalidate this entity again later
        }

        cache.cacheIssues(result.issues);   // update cache
      };

    }).filter(Boolean);

    // Perform the work in chunks.
    // Because this will happen during idle callbacks, we want to choose a chunk size
    // that won't make the browser stutter too badly.
    cache.queue = cache.queue.concat(utilArrayChunk(jobs, 50));

    // Perform the work
    if (cache.queuePromise) return cache.queuePromise;

    cache.queuePromise = this._processQueue(cache)
      .then(() => this._revalidateProvisionalEntities(cache))
      .catch(e => console.error(e))  // eslint-disable-line
      .finally(() => cache.queuePromise = null);

    return cache.queuePromise;
  }


  /**
   * _revalidateProvisionalEntities
   * Sometimes a validator will return a "provisional" result.
   * In this situation, we'll need to revalidate the entity later.
   * This function waits a delay, then places them back into the validation queue.
   * @param  {ValidationCache}  cache - The cache to revalidate (`_head` or `_base`)
   */
  _revalidateProvisionalEntities(cache) {
    if (!cache.provisionalEntityIDs.size) return;  // nothing to do

    const handle = window.setTimeout(() => {
      this._deferredST.delete(handle);
      if (!cache.provisionalEntityIDs.size) return;  // nothing to do
      this._validateEntitiesAsync(cache.provisionalEntityIDs, cache);
    }, RETRY);

    this._deferredST.add(handle);
  }


  /**
   * _processQueue
   * Process the next chunk of deferred validation work
   * This may take time but happen in the background during browser idle time.
   * @param  {ValidationCache}  cache - The cache to process (`_head` or `_base`)
   * @return {Promise}  Promise fulfilled when the validation has completed.
   */
  _processQueue(cache) {
    // console.log(`${cache.which} queue length ${cache.queue.length}`);

    if (!cache.queue.length) return Promise.resolve();  // we're done
    const chunk = cache.queue.pop();

    return new Promise((resolve, reject) => {
        const handle = window.requestIdleCallback(() => {
          this._deferredRIC.delete(handle);
          // const t0 = performance.now();
          chunk.forEach(job => job());
          // const t1 = performance.now();
          // console.log('chunk processed in ' + (t1 - t0) + ' ms');
          resolve();
        });
        this._deferredRIC.set(handle, reject);
      })
      .then(() => { // dispatch an event sometimes to redraw various UI things
        if (cache.queue.length % 100 === 0) {
          this.emit('validated');
        }
      })
      .then(() => this._processQueue(cache));
  }
}



/**
 * `ValidationCache`
 * Creates a cache to store validation state
 * We create 2 of these:
 *   `base` for validation on the base graph (unedited)
 *   `head` for validation on the head graph (user edits applied)
 */
class ValidationCache {

  /**
   * @constructor
   * @param  which String 'base' or 'head' to keep track of it
   */
  constructor(which) {
    this.which = which;
    this.graph = null;
    this.queue = [];
    this.queuePromise = null;
    this.queuedEntityIDs = new Set();
    this.provisionalEntityIDs = new Set();
    this.issues = new Map();          // Map(issue.id -> issue)
    this.entityIssueIDs = new Map();  // Map(entity.id -> Set(issue.id))
  }


  cacheIssue(issue) {
    for (const entityID of issue.entityIds ?? []) {
      let issueIDs = this.entityIssueIDs.get(entityID);
      if (!issueIDs) {
        issueIDs = new Set();
        this.entityIssueIDs.set(entityID, issueIDs);
      }
      issueIDs.add(issue.id);
    }
    this.issues.set(issue.id, issue);
  }


  uncacheIssue(issue) {
    for (const entityID of issue.entityIds ?? []) {
      let issueIDs = this.entityIssueIDs.get(entityID);
      if (issueIDs) {
        issueIDs.delete(issue.id);
        if (!issueIDs.size) {
          this.entityIssueIDs.delete(entityID);
        }
      }
    }
    this.issues.delete(issue.id);
  }


  cacheIssues(issues = []) {
    for (const issue of issues) {
      this.cacheIssue(issue);
    }
  }


  uncacheIssues(issues = []) {
    for (const issue of issues) {
      this.uncacheIssue(issue);
    }
  }


  uncacheIssuesOfType(type) {
    const issues = [ ...this.issues.values() ];
    const issuesOfType = issues.filter(issue => issue.type === type);
    this.uncacheIssues(issuesOfType);
  }


  // Remove a single entity and all its related issues from the caches
  uncacheEntityID(entityID) {
    const issueIDs = this.entityIssueIDs.get(entityID) ?? [];
    for (const issueID of issueIDs) {
      const issue = this.issues.get(issueID);
      if (issue) {
        this.uncacheIssue(issue);
      }
    }

    this.entityIssueIDs.delete(entityID);
    this.provisionalEntityIDs.delete(entityID);
  }


  // Return the expandeded set of entityIDs related to issues for the given entityIDs
  // @param   entityIDs  Array or Set containing entityIDs.
  // @return  Set of entityIDs related to the given entityIDs
  withAllRelatedEntities(entityIDs = []) {
    let results = new Set();
    for (const entityID of entityIDs) {
      results.add(entityID);  // include self

      const issueIDs = this.entityIssueIDs.get(entityID) ?? [];
      for (const issueID of issueIDs) {
        const issue = this.issues.get(issueID);
        const relatedEntityIDs = issue?.entityIDs ?? [];
        for (const relatedEntityID of relatedEntityIDs) {
          results.add(relatedEntityID);
        }
      }
    }

    return results;
  }
}
