import { /* utilArrayGroupBy,*/ utilArrayUnion } from '@rapid-sdk/util';

import { AbstractSystem } from './AbstractSystem.js';
import { osmEntity, osmLifecyclePrefixes } from '../osm/index.js';


const traffic_roads = {
  'motorway': true,
  'motorway_link': true,
  'trunk': true,
  'trunk_link': true,
  'primary': true,
  'primary_link': true,
  'secondary': true,
  'secondary_link': true,
  'tertiary': true,
  'tertiary_link': true,
  'residential': true,
  'unclassified': true,
  'living_street': true
};

const service_roads = {
  'busway': true,
  'service': true,
  'road': true,
  'track': true
};

const paths = {
  'path': true,
  'footway': true,
  'cycleway': true,
  'bridleway': true,
  'steps': true,
  'pedestrian': true
};



class Filter {
  constructor(fn) {
    this.match = fn;
    this.enabled = true;   // true = shown, false = hidden
    this.count = 0;        // number of objects currently filtered
  }
}


/**
 * `FilterSystem` maintains matching and filtering rules.
 * Each `Filter` is basically a filter function that returns true if an entity matches.
 * The code in here is relatively "hot", as it gets run against every entity.
 *
 * Events available:
 *   `filterchange`   Fires whenever user changes the enabled/disabled filters
 */
export class FilterSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  context  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'filters';
    this.dependencies = new Set(['editor', 'storage', 'urlhash']);

    this._filters = new Map();        // Map(filterID -> Filter)
    this._hidden = new Set();         // Set(filterID) to hide
    this._forceVisible = new Set();   // Set(entityIDs) to show
    this._cache = {};                 // Cache of entity.key to matched filterIDs
    this._initPromise = null;
//    this._deferred = new Set();

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._hashchange = this._hashchange.bind(this);

    // hardcode the filters for now
    this._filters.set('points',          new Filter(this._isPoint.bind(this)));
    this._filters.set('traffic_roads',   new Filter(this._isTrafficRoad.bind(this)));
    this._filters.set('service_roads',   new Filter(this._isServiceRoad.bind(this)));
    this._filters.set('paths',           new Filter(this._isPath.bind(this)));
    this._filters.set('buildings',       new Filter(this._isBuilding.bind(this)));
    this._filters.set('building_parts',  new Filter(this._isBuildingPart.bind(this)));
    this._filters.set('indoor',          new Filter(this._isIndoor.bind(this)));
    this._filters.set('landuse',         new Filter(this._isLanduse.bind(this)));
    this._filters.set('boundaries',      new Filter(this._isBoundary.bind(this)));
    this._filters.set('water',           new Filter(this._isWater.bind(this)));
    this._filters.set('rail',            new Filter(this._isRail.bind(this)));
    this._filters.set('pistes',          new Filter(this._isPiste.bind(this)));
    this._filters.set('aerialways',      new Filter(this._isAerialway.bind(this)));
    this._filters.set('power',           new Filter(this._isPower.bind(this)));
    this._filters.set('past_future',     new Filter(this._isPastFuture.bind(this)));
    this._filters.set('others',          new Filter(this._isOther.bind(this)));
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

    const context = this.context;
    const urlhash = context.systems.urlhash;

    const prerequisites = Promise.all([
      urlhash.initAsync()
    ]);

    return this._initPromise = prerequisites
      .then(() => {
        // Setup event handlers..
        urlhash.on('hashchange', this._hashchange);
      });

//    // warm up the feature matching cache upon merging fetched data
//    const editor = this.context.systems.editor;
//    editor.on('merge.features', function(newEntities) {
//      if (!newEntities) return;
//      var handle = window.requestIdleCallback(function() {
//        var graph = editor.staging.graph;
//        var types = utilArrayGroupBy(newEntities, 'type');
//        // ensure that getMatches is called on relations before ways
//        var entities = [].concat(types.relation || [], types.way || [], types.node || []);
//        for (var i = 0; i < entities.length; i++) {
//          var geometry = entities[i].geometry(graph);
//          this.getMatches(entities[i], graph, geometry);
//        }
//      });
//      this._deferred.add(handle);
//    });
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    const context = this.context;
    const storage = context.systems.storage;
    const urlhash = context.systems.urlhash;

    // Take filter values from urlhash first, localstorage second,
    // Default to having boundaries hidden
    const toHide = urlhash.getParam('disable_features') ?? storage.getItem('disabled-features') ?? 'boundaries';
    const filterIDs = toHide.replace(/;/g, ',').split(',').map(s => s.trim()).filter(Boolean);
    for (const filterID of filterIDs) {
      this._hidden.add(filterID);
      const filter = this._filters.get(filterID);
      filter.enabled = false;
    }
    this._update();
    this._started = true;

    return Promise.resolve();
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
//    for (const handle of this._deferred) {
//      window.cancelIdleCallback(handle);
//    }
//    this._deferred.clear();
    this._cache = {};
    this._forceVisible.clear();
    return Promise.resolve();
  }


  /**
   * keys
   */
  get keys() {
    return [...this._filters.keys()];
  }


  /**
   * hidden
   * @return {Set<string>}  Set of hidden filterIDs
   */
  get hidden() {
    return this._hidden;
  }


  /**
   * isEnabled
   * @param  {string}  filterID
   * @return {boolean} true/false
   */
  isEnabled(filterID) {
    const filter = this._filters.get(filterID);
    return filter?.enabled;
  }


  /**
   * enable
   * Enables the given filter
   * @param  {string}  filterID
   */
  enable(filterID) {
    const filter = this._filters.get(filterID);
    if (filter && !filter.enabled) {
      filter.enabled = true;
      this._update();
    }
  }


  /**
   * enableAll
   * Enables all filters
   */
  enableAll() {
    let didChange = false;
    for (const filter of this._filters.values()) {
      if (!filter.enabled) {
        didChange = true;
        filter.enabled = true;
      }
    }
    if (didChange) {
      this._update();
    }
  }


  /**
   * disable
   * Disables the given filter
   * @param  {string}  filterID
   */
  disable(filterID) {
    const filter = this._filters.get(filterID);
    if (filter?.enabled) {
      filter.enabled = false;
      this._update();
    }
  }


  /**
   * disableAll
   * Disables all filters
   */
  disableAll() {
    let didChange = false;
    for (const filter of this._filters.values()) {
      if (filter.enabled) {
        didChange = true;
        filter.enabled = false;
      }
    }
    if (didChange) {
      this._update();
    }
  }


  /**
   * toggle
   * Toggles the given filter between enabled/disabled states
   * @param  {string}  filterID
   */
  toggle(filterID) {
    const filter = this._filters.get(filterID);
    if (!filter) return;

    filter.enabled = !filter.enabled;
    this._update();
  }


// stats are gathered by `filterScene()` now
//
//  /**
//   * resetStats
//   * Resets all stats and emits a `filterchange` event
//   */
//  resetStats() {
//    for (const filter of this._filters.values()) {
//      filter.count = 0;
//    }
//    this.emit('filterchange');
//  }

//  /**
//   * gatherStats
//   * Gathers all filter stats for the given scene
//   * @param   {Array<Entity>  d   Array of entities to test
//   * @param   {Graph}         resolver
//   */
//  gatherStats(d, resolver) {
//    const types = utilArrayGroupBy(d, 'type');
//    const entities = [].concat(types.relation || [], types.way || [], types.node || []);
//
//    for (const filter of this._filters.values()) {   // reset stats
//      filter.count = 0;
//    }
//
//    for (const entity of entities) {
//      const geometry = entity.geometry(resolver);
//      const matchedKeys = Object.keys(this.getMatches(entity, resolver, geometry));
//      for (const filterID of matchedKeys) {
//        const filter = this._filters.get(filterID);
//        filter.count++;
//      }
//    }
//  }


  /**
   * getStats
   * This returns stats about which filters are currently enabled,
   *  and how many entities in the scene are filtered.
   * @return  {Object}  result
   */
  getStats() {
    const result = {};
    for (const [filterID, filter] of this._filters) {
      result[filterID] = {
        enabled: filter.enabled,
        count:   filter.count
      };
    }
    return result;
  }


  /**
   * clear
   * Clears the cache of entity matches for the given entities
   * @param  {Array<Entity>}  entities - Entities to clear cache
   */
  clear(entities) {
    for (const entity of entities) {
      this.clearEntity(entity);
    }
  }


  /**
   * clearEntity
   * Clears the cache of entity matches for a single entity
   * @param  {Entity}  entity
   */
  clearEntity(entity) {
    const ekey = osmEntity.key(entity);
    delete this._cache[ekey];
  }


  /**
   * getMatches
   * Matches a single entity against the filters
   * @param   {Entity}       entity   - The Entity to test
   * @param   {Graph}        resolver - Graph
   * @param   {string}       geometry - geometry of the Entity ('point', 'line', 'vertex', 'area', 'relation')
   * @return  {Set<string>}  A Set containing the matched filterIDs
   */
  getMatches(entity, resolver, geometry) {
    // skip - vertexes are hidden based on whatever filters their parent ways have matched
    if (geometry === 'vertex') return new Set();
    // skip - most relations don't have a geometry worth checking
    // (note that multipolygons are considered 'area' geometry not 'relation')
    if (geometry === 'relation' && entity.tags.type !== 'boundary') return new Set();

    const ekey = osmEntity.key(entity);
    let cached = this._cache[ekey];
    if (!cached) {
      this._cache[ekey] = cached = { parents: null, matches: null };
    }
    if (cached.matches) {    // done already
      return cached.matches;
    }

    // If this entity has parents, make sure the parents are matched first.
    // see iD#2548, iD#2887
    const parents = cached.parents || this.getParents(entity, resolver, geometry);
    if (parents.length) {
      for (const parent of parents) {
        const pkey = osmEntity.key(parent);
        const pmatches = this._cache[pkey]?.matches;
        if (pmatches) continue;  // parent matching was done already
        this.getMatches(parent, resolver, parent.geometry(resolver));  // recurse up
      }
    }

    let matches = new Set();
    for (const [filterID, filter] of this._filters) {
      if (filterID === 'others') {     // 'others' matches last
        if (matches.size) continue;    // skip if we matched something better already

        // Handle situations where a way should match whatever its parent relation matched.
        // - hasn't matched other 'interesting' filters AND
        //   - belongs only to a single multipolygon relation  OR
        //   - belongs only to boundary relations
        // see iD#2548, iD#2887
        if (entity.type === 'way' && (
          (parents.length === 1 && parents[0].isMultipolygon()) ||
          (parents.length > 0 && parents.every(parent => parent.tags.type === 'boundary'))
        )) {
          const pkey = osmEntity.key(parents[0]);
          const pmatches = this._cache[pkey]?.matches;
          if (pmatches) {
            matches = new Set(pmatches);  // copy
            continue;
          }
        }
      }

      if (filter.match(entity.tags, geometry)) {
        matches.add(filterID);
      }
    }

    cached.matches = matches;
    return matches;
  }


  /**
   * getParents
   * Returns parentWays of vertexes or parentRelations of other geometry types
   * @param   {Entity}  entity   - The Entity to test
   * @param   {Graph}   resolver - Graph
   * @param   {string}  geometry - geometry of the Entity ('point', 'line', 'vertex', 'area', 'relation')
   * @return  {Array<Entity>}  An array of parent entities
   */
  getParents(entity, resolver, geometry) {
    if (geometry === 'point') return [];

    const ekey = osmEntity.key(entity);
    let cached = this._cache[ekey];
    if (!cached) {
      this._cache[ekey] = cached = { parents: null, matches: null };
    }

    if (!cached.parents) {
      let parents;
      if (geometry === 'vertex') {
        parents = resolver.parentWays(entity);
      } else {   // 'line', 'area', 'relation'
        parents = resolver.parentRelations(entity);
      }
      cached.parents = parents;
    }

    return cached.parents;
  }


  /**
   * isHiddenPreset
   * Checks whether a given preset would be hidden by the current filtering rules
   * @param   {Preset}   preset   - he Preset to test
   * @param   {string}   geometry - geometry of the Preset ('point', 'line', 'vertex', 'area', 'relation')
   * @return  {string?}  The first `filterID` which causes the Preset to be hidden, or `null`
   */
  isHiddenPreset(preset, geometry) {
    if (!this._hidden.size) return null;
    if (!preset.tags) return null;

    const tags = preset.setTags({}, geometry);
    for (const [filterID, filter] of this._filters) {
      if (filter.match(tags, geometry)) {
        if (this._hidden.has(filterID)) {
          return filterID;
        }
        return null;
      }
    }
    return null;
  }


  /**
   * isHiddenFeature
   * Checks whether a given Entity would be hidden by the current filtering rules.
   * Important note:  In OSM a feature can be several things, so there might be multiple matches.
   * We only consider a feature hidden of _all_ of the matched rules are hidden.
   * @param   {Entity}   entity   - The Entity to test
   * @param   {Graph}    resolver - Graph
   * @param   {string}   geometry - geometry of the Entity ('point', 'line', 'vertex', 'area', 'relation')
   * @return  {string?}  The first `filterID` which causes the Entity to be hidden, or `null`
   */
  isHiddenFeature(entity, resolver, geometry) {
    if (!this._hidden.size) return null;
    if (!entity.version) return null;
    if (this._forceVisible.has(entity.id)) return null;

    const filterIDs = [...this.getMatches(entity, resolver, geometry)];
    if (filterIDs.length && filterIDs.every(filterID => this._hidden.has(filterID))) {
      return filterIDs[0];
    } else {
      return null;
    }
  }


  /**
   * isHiddenVertex
   * Checks whether a given child entity would be hidden by the current filtering rules
   * We only consider a child hidden of _all_ of the matched parent features are hidden.
   * @param   {Entity}   entity   - The Entity to test
   * @param   {Graph}    resolver - Graph
   * @return  {string?}  The first `filterID` which causes the Entity to be hidden, or `null`
   */
  isHiddenVertex(entity, resolver) {
    if (!this._hidden.size) return null;
    if (!entity.version) return null;
    if (this._forceVisible.has(entity.id)) return null;

    const parents = this.getParents(entity, resolver, 'vertex');
    if (!parents.length) return null;

    let filterID = null;
    for (const parent of parents) {
      const parentFilterID = this.isHidden(parent, resolver, parent.geometry(resolver));
      if (!parentFilterID) return null;  // parent is not hidden
      if (!filterID) filterID = parentFilterID;  // keep the first one
    }
    return filterID;
  }


  /**
   * hasHiddenConnections
   * Checks whether a given entity is connected to a feature that is hidden
   * @param   {Entity}   entity   - The Entity to test
   * @param   {Graph}    resolver - Graph
   * @return  {boolean}  true/false
   */
  hasHiddenConnections(entity, resolver) {
    if (!this._hidden.size) return false;

    let childNodes, connections;
    if (entity.type === 'midpoint') {
      childNodes = [resolver.entity(entity.edge[0]), resolver.entity(entity.edge[1])];
      connections = [];
    } else {
      childNodes = entity.nodes ? resolver.childNodes(entity) : [];
      connections = this.getParents(entity, resolver, entity.geometry(resolver));
    }

    // Gather ways connected to child nodes..
    connections = childNodes.reduce((result, e) => {
      return resolver.isShared(e) ? utilArrayUnion(result, resolver.parentWays(e)) : result;
    }, connections);

    return connections.some(other => this.isHidden(other, resolver, other.geometry(resolver)));
  }


  /**
   * isHidden
   * Checks whether a given entity is hidden
   * @param   {Entity}   entity   - The Entity to test
   * @param   {Graph}    resolver - Graph
   * @param   {string}   geometry - geometry of the Entity ('point', 'line', 'vertex', 'area', 'relation')
   * @return  {string?}  The first `filterID` which causes the Entity to be hidden, or `null`
   */
  isHidden(entity, resolver, geometry) {
    if (!this._hidden.size) return null;
    if (!entity.version) return null;

    if (geometry === 'vertex') {
      return this.isHiddenVertex(entity, resolver);
    } else {
      return this.isHiddenFeature(entity, resolver, geometry);
    }
  }


  /**
   * filterScene
   * Returns a result Array containing the non-hidden entities.
   * This function also gathers the stats about how many entities are
   * being filtered by the enabled filter rules.
   * @param   {Array<Entity>}  entities - the Entities to test
   * @param   {Graph}          resolver - Graph
   * @return  {Array<Entity>}  Array of non-hidden entities
   */
  filterScene(entities, resolver) {
    for (const filter of this._filters.values()) {
      filter.count = 0;
    }

    if (!this._hidden.size) return entities;  // no filters enabled

    const results = [];
    for (const entity of entities) {
      const geometry = entity.geometry(resolver);
      const filterID = this.isHidden(entity, resolver, geometry);
      if (filterID) {
        // don't count uninteresting vertices
        const ignore = (geometry === 'vertex' && !entity.hasInterestingTags());
        if (!ignore) {
          const filter = this._filters.get(filterID);
          filter.count++;
        }
      } else {
        results.push(entity);
      }
    }

    return results;
  }


  /**
   * forceVisible
   * Adds the given entityIDs to the _forceVisible Set
   * This is usually done temporarily so that users can see stuff as they edit
   * that might otherwise be hidden
   * @param   {Array<string>}  entityIDs - Array of Entity ids
   */
  forceVisible(entityIDs) {
    this._forceVisible = new Set();

    const editor = this.context.systems.editor;
    const graph = editor.staging.graph;

    for (const entityID of entityIDs) {
      this._forceVisible.add(entityID);

      const entity = graph.hasEntity(entityID);
      if (entity?.type === 'relation') {  // include relation members (one level deep)
        for (const member of entity.members) {
          this._forceVisible.add(member.id);
        }
      }
    }
  }


  /**
   * _hashchange
   * Respond to any changes appearing in the url hash
   * @param  {Map<string, string>}  currParams - The current hash parameters
   * @param  {Map<string, string>}  prevParams - The previous hash parameters
   */
  _hashchange(currParams, prevParams) {
    // disable_features
    const newDisable = currParams.get('disable_features');
    const oldDisable = prevParams.get('disable_features');
    if (newDisable !== oldDisable) {
      let toDisableIDs = new Set();
      if (typeof newDisable === 'string') {
        toDisableIDs = new Set(newDisable.replace(/;/g, ',').split(','));
      }

      let didChange = false;
      for (const [filterID, filter] of this._filters) {
        if (filter.enabled && toDisableIDs.has(filterID)) {
          filter.enabled = false;
          didChange = true;
        } else if (!filter.enabled && !toDisableIDs.has(filterID)) {
          filter.enabled = true;
          didChange = true;
        }
      }

      if (didChange) {
        this._update();
      }
    }
  }


  /**
   * _update
   * Called whenever the enabled/disabled filters change
   * Used to push changes in state to the urlhash and the localStorage
   */
  _update() {
    const context = this.context;
    const storage = context.systems.storage;
    const urlhash = context.systems.urlhash;

    // gather hidden
    this._hidden = new Set();
    for (const [filterID, filter] of this._filters) {
      if (!filter.enabled) {
        this._hidden.add(filterID);
      }
    }
    const filterIDs = [...this._hidden].join(',');

    // update url hash
    urlhash.setParam('disable_features', filterIDs.length ? filterIDs : null);

    // update localstorage
    storage.setItem('disabled-features', filterIDs);

    this.emit('filterchange');
  }


  // matchers

  _isPoint(tags, geometry) {
    return geometry === 'point';
  }

  _isTrafficRoad(tags) {
    return traffic_roads[tags.highway];
  }

  _isServiceRoad(tags) {
    return service_roads[tags.highway];
  }

  _isPath(tags) {
    return paths[tags.highway];
  }

  _isBuilding(tags) {
    return (
      (!!tags.building && tags.building !== 'no') ||
      tags.parking === 'multi-storey' ||
      tags.parking === 'sheds' ||
      tags.parking === 'carports' ||
      tags.parking === 'garage_boxes'
    ) && !this._isPastFuture(tags);
  }

  _isBuildingPart(tags) {
    return tags['building:part'];
  }

  _isIndoor(tags) {
    return tags.indoor;
  }

  _isLanduse(tags, geometry) {
    return geometry === 'area' &&
      !this._isBuilding(tags) &&
      !this._isBuildingPart(tags) &&
      !this._isIndoor(tags) &&
      !this._isWater(tags) &&
      !this._isAerialway(tags) &&
      !this._isPastFuture(tags);
  }

  _isBoundary(tags) {
    return (
      !!tags.boundary
    ) && !(
      traffic_roads[tags.highway] ||
      service_roads[tags.highway] ||
      paths[tags.highway] ||
      tags.waterway ||
      tags.railway ||
      tags.landuse ||
      tags.natural ||
      tags.building ||
      tags.power
    );
  }

  _isWater(tags) {
    return (
      !!tags.waterway ||
      tags.natural === 'water' ||
      tags.natural === 'coastline' ||
      tags.natural === 'bay' ||
      tags.landuse === 'pond' ||
      tags.landuse === 'basin' ||
      tags.landuse === 'reservoir' ||
      tags.landuse === 'salt_pond'
    ) && !this._isPastFuture(tags);
  }

  _isRail(tags) {
    return (
      !!tags.railway || tags.landuse === 'railway'
    ) && !(
      traffic_roads[tags.highway] ||
      service_roads[tags.highway] ||
      paths[tags.highway]
    ) && !this._isPastFuture(tags);
  }

  _isPiste(tags) {
    return tags['piste:type'];
  }

  _isAerialway(tags) {
    return tags.aerialway &&
      tags.aerialway !== 'yes' &&
      tags.aerialway !== 'station';
  }

  _isPower(tags) {
    return !!tags.power && !this._isPastFuture(tags);
  }

  // contains a past/future tag, but not in active use as a road/path/cycleway/etc..
  _isPastFuture(tags) {
    if (traffic_roads[tags.highway] || service_roads[tags.highway] || paths[tags.highway] ) {
      return false;
    }

    for (const [k, v] of Object.entries(tags)) {
      if (osmLifecyclePrefixes[k] || osmLifecyclePrefixes[v]) return true;

      const parts = k.split(':');
      if (parts.length === 1) continue;
      if (osmLifecyclePrefixes[parts[0]]) return true;
    }

    return false;
  }

  // Lines or areas that don't match another feature filter.
  // IMPORTANT: The 'others' feature must be the last one defined,
  // so that code in getMatches can skip this test if someting else was matched.
  _isOther(tags, geometry) {
    return (geometry === 'line' || geometry === 'area');
  }
}
