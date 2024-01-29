import { utilArrayGroupBy, utilArrayUnion } from '@rapid-sdk/util';

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



class FilterRule {
  constructor(filter) {
    this.filter = filter;
    this.enabled = true;   // true = shown, false = hidden
    this.count = 0;
  }
}


/**
 * `FilterSystem` maintains matching and filtering rules.
 * Each rule is basically a filter function that returns true if an entity matches the rule.
 * The code in here is relatively "hot", as it gets run against every entity.
 *
 * Events available:
 *   `filterchange`   Fires whenever user changes the enabled/disabled rules
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

    this._rules = new Map();          // Map(rulekey -> rule)
    this._hidden = new Set();         // Set(rulekey) to hide
    this._forceVisible = new Set();   // Set(entityIDs) to show
    this._cache = {};                 // Cache of entity.key to matched rules
    this._initPromise = null;
//    this._deferred = new Set();

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._hashchange = this._hashchange.bind(this);

    // hardcode the rules for now
    this._rules.set('points',          new FilterRule(this._isPoint.bind(this)));
    this._rules.set('traffic_roads',   new FilterRule(this._isTrafficRoad.bind(this)));
    this._rules.set('service_roads',   new FilterRule(this._isServiceRoad.bind(this)));
    this._rules.set('paths',           new FilterRule(this._isPath.bind(this)));
    this._rules.set('buildings',       new FilterRule(this._isBuilding.bind(this)));
    this._rules.set('building_parts',  new FilterRule(this._isBuildingPart.bind(this)));
    this._rules.set('indoor',          new FilterRule(this._isIndoor.bind(this)));
    this._rules.set('landuse',         new FilterRule(this._isLanduse.bind(this)));
    this._rules.set('boundaries',      new FilterRule(this._isBoundary.bind(this)));
    this._rules.set('water',           new FilterRule(this._isWater.bind(this)));
    this._rules.set('rail',            new FilterRule(this._isRail.bind(this)));
    this._rules.set('pistes',          new FilterRule(this._isPiste.bind(this)));
    this._rules.set('aerialways',      new FilterRule(this._isAerialway.bind(this)));
    this._rules.set('power',           new FilterRule(this._isPower.bind(this)));
    this._rules.set('past_future',     new FilterRule(this._isPastFuture.bind(this)));
    this._rules.set('others',          new FilterRule(this._isOther.bind(this)));
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

    const storage = this.context.systems.storage;
    const urlhash = this.context.systems.urlhash;
    const prerequisites = Promise.all([
      storage.initAsync(),
      urlhash.initAsync()
    ]);

    return this._initPromise = prerequisites
      .then(() => {
        urlhash.on('hashchange', this._hashchange);

        // Take initial values from urlhash first, localstorage second
        const toHide = urlhash.getParam('disable_features') ?? storage.getItem('disabled-features');

        if (toHide) {
          const keys = toHide.replace(/;/g, ',').split(',').map(s => s.trim()).filter(Boolean);
          for (const key of keys) {
            this._hidden.add(key);
            const rule = this._rules.get(key);
            rule.enabled = false;
          }
        }
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
    return [...this._rules.keys()];
  }


  /**
   * hidden
   * @return Set of hidden rule keys
   */
  get hidden() {
    return this._hidden;
  }


  /**
   * isEnabled
   * @param   k  rule key
   * @return  true/false
   */
  isEnabled(k) {
    const rule = this._rules.get(k);
    return rule?.enabled;
  }


  /**
   * enable
   * Enables the given rule key
   * @param  k  the rule key
   */
  enable(k) {
    const rule = this._rules.get(k);
    if (rule && !rule.enabled) {
      rule.enabled = true;
      this._update();
    }
  }


  /**
   * enableAll
   * Enables all rule keys
   */
  enableAll() {
    let didChange = false;
    for (const rule of this._rules.values()) {
      if (!rule.enabled) {
        didChange = true;
        rule.enabled = true;
      }
    }
    if (didChange) {
      this._update();
    }
  }


  /**
   * disable
   * Disables the given rule key
   * @param  k  the rule key
   */
  disable(k) {
    const rule = this._rules.get(k);
    if (rule && rule.enabled) {
      rule.enabled = false;
      this._update();
    }
  }


  /**
   * disableAll
   * Disables all rule keys
   */
  disableAll() {
    let didChange = false;
    for (const rule of this._rules.values()) {
      if (rule.enabled) {
        didChange = true;
        rule.enabled = false;
      }
    }
    if (didChange) {
      this._update();
    }
  }


  /**
   * toggle
   * Toggles the given rule key between enabled/disabled states
   * @param  k  the rule key
   */
  toggle(k) {
    const rule = this._rules.get(k);
    if (!rule) return;

    rule.enabled = !rule.enabled;
    this._update();
  }


  /**
   * resetStats
   * Resets all stats and emits a `filterchange` event
   */
  resetStats() {
    for (const rule of this._rules.values()) {
      rule.count = 0;
    }
    this.emit('filterchange');
  }


  /**
   * gatherStats
   * Gathers all filter stats for the given scene
   * @param   d         Array of entities in the scene
   * @param   resolver  Graph
   */
  gatherStats(d, resolver) {
    const types = utilArrayGroupBy(d, 'type');
    const entities = [].concat(types.relation || [], types.way || [], types.node || []);

    for (const rule of this._rules.values()) {  // reset stats
      rule.count = 0;
    }

    for (const entity of entities) {
      const geometry = entity.geometry(resolver);
      const matchedKeys = Object.keys(this.getMatches(entity, resolver, geometry));
      for (const key of matchedKeys) {
        const rule = this._rules.get(key);
        rule.count++;
      }
    }
  }


  /**
   * stats
   * Returns a result Object of all the rules and count of objects filtered
   * @return  Object
   */
  stats() {
    let result = {};
    for (const [key, rule] of this._rules) {
      result[key] = rule.count;
    }
    return result;
  }


  /**
   * clear
   * Clears the cache of entity matches for the given entities
   * @param  entities  Array of entities
   */
  clear(entities) {
    for (const entity of entities) {
      this.clearEntity(entity);
    }
  }


  /**
   * clearEntity
   * Clears the cache of entity matches for a single entity
   * @param  entity  Entity
   */
  clearEntity(entity) {
    const ekey = osmEntity.key(entity);
    delete this._cache[ekey];
  }


  /**
   * getMatches
   * Matches a single entity against the rules (`rule.filter` actually where this happens?)
   * @param   entity    Entity
   * @param   resolver  Graph
   * @param   geometry  geometry of the entity ('point', 'line', 'vertex', 'area', 'relation')
   * @return  An Object with keys that are the matched rule ids (e.g. `{ points: true, power: true }`)
   */
  getMatches(entity, resolver, geometry) {
    // skip - vertexes are hidden based on whatever rules their parent ways have matched
    if (geometry === 'vertex') return {};
    // skip - most relations don't have a geometry worth checking
    // (note that multipolygons are considered 'area' geometry not 'relation')
    if (geometry === 'relation' && entity.tags.type !== 'boundary') return {};

    const ekey = osmEntity.key(entity);
    if (!this._cache[ekey]) {
      this._cache[ekey] = {};
    }

    if (!this._cache[ekey].matches) {
      let matches = {};
      let hasMatch = false;

      for (const [key, rule] of this._rules) {
        if (key === 'others') {
          if (hasMatch) continue;  // we matched something better already

          // If an entity...
          // 1. is a way that hasn't matched other 'interesting' feature rules,
          if (entity.type === 'way') {
            const parents = this.getParents(entity, resolver, geometry);

            //  2a. belongs only to a single multipolygon relation
            if ((parents.length === 1 && parents[0].isMultipolygon()) ||
              // 2b. or belongs only to boundary relations
              (parents.length > 0 && parents.every(parent => parent.tags.type === 'boundary'))) {

              // ...then match whatever feature rules the parent relation has matched.
              // see iD#2548, iD#2887
              // IMPORTANT: For this to work, getMatches must be called on relations before ways.
              const pkey = osmEntity.key(parents[0]);
              if (this._cache[pkey] && this._cache[pkey].matches) {
                matches = Object.assign({}, this._cache[pkey].matches);  // shallow copy
                continue;
              }
            }
          }
        }

        if (rule.filter(entity.tags, geometry)) {
          matches[key] = hasMatch = true;
        }
      }
      this._cache[ekey].matches = matches;
    }

    return this._cache[ekey].matches;
  }


  /**
   * getParents
   * Returns parentWays of vertexes or parentRelations of other geometry types
   * @param   entity    Entity
   * @param   resolver  Graph
   * @param   geometry  geometry of the entity ('point', 'line', 'vertex', 'area', 'relation')
   * @return  An array of parent entities
   */
  getParents(entity, resolver, geometry) {
    if (geometry === 'point') return [];

    const ekey = osmEntity.key(entity);
    if (!this._cache[ekey]) {
      this._cache[ekey] = {};
    }

    if (!this._cache[ekey].parents) {
      let parents;
      if (geometry === 'vertex') {
        parents = resolver.parentWays(entity);
      } else {   // 'line', 'area', 'relation'
        parents = resolver.parentRelations(entity);
      }
      this._cache[ekey].parents = parents;
    }
    return this._cache[ekey].parents;
  }


  /**
   * isHiddenPreset
   * Checks whether a given preset would be hidden by the current filtering rules
   * @param   preset    Preset
   * @param   geometry  geometry of the Preset ('point', 'line', 'vertex', 'area', 'relation')
   * @return  The rule which causes the preset to be hidden, or `false`
   */
  isHiddenPreset(preset, geometry) {
    if (!this._hidden.size) return false;
    if (!preset.tags) return false;

    const tags = preset.setTags({}, geometry);
    for (const [key, rule] of this._rules) {
      if (rule.filter(tags, geometry)) {
        if (this._hidden.has(key)) {
          return key;
        }
        return false;
      }
    }
    return false;
  }


  /**
   * isHiddenFeature
   * Checks whether a given entity would be hidden by the current filtering rules
   * @param   entity    Entity
   * @param   resolver  Graph
   * @param   geometry  geometry of the entity ('point', 'line', 'vertex', 'area', 'relation')
   * @return  true/false
   */
  isHiddenFeature(entity, resolver, geometry) {
    if (!this._hidden.size) return false;
    if (!entity.version) return false;
    if (this._forceVisible.has(entity.id)) return false;

    const matches = Object.keys(this.getMatches(entity, resolver, geometry));
    return matches.length && matches.every(key => this._hidden.has(key));
  }


  /**
   * isHiddenChild
   * Checks whether a given child entity would be hidden by the current filtering rules
   * @param   entity    Entity
   * @param   resolver  Graph
   * @param   geometry  geometry of the entity ('point', 'line', 'vertex', 'area', 'relation')
   * @return  true/false
   */
  isHiddenChild(entity, resolver, geometry) {
    if (!this._hidden.size) return false;
    if (!entity.version || geometry === 'point') return false;
    if (this._forceVisible.has(entity.id)) return false;

    const parents = this.getParents(entity, resolver, geometry);
    if (!parents.length) return false;

    for (const parent of parents) {
      if (!this.isHidden(parent, resolver, parent.geometry(resolver))) {
        return false;
      }
    }
    return true;
  }


  /**
   * hasHiddenConnections
   * Checks whether a given entity is connected to a feature that is hidden
   * @param   entity    Entity
   * @param   resolver  Graph
   * @return  true/false
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

    // gather ways connected to child nodes..
    connections = childNodes.reduce((result, e) => {
      return resolver.isShared(e) ? utilArrayUnion(result, resolver.parentWays(e)) : result;
    }, connections);

    return connections.some(other => this.isHidden(other, resolver, other.geometry(resolver)));
  }


  /**
   * isHidden
   * Checks whether a given entity is hidden
   * @param   entity    Entity
   * @param   resolver  Graph
   * @param   geometry  geometry of the entity ('point', 'line', 'vertex', 'area', 'relation')
   * @return  true/false
   */
  isHidden(entity, resolver, geometry) {
    if (!this._hidden.size) return false;
    if (!entity.version) return false;

    if (geometry === 'vertex') {
      return this.isHiddenChild(entity, resolver, geometry);
    } else {
      return this.isHiddenFeature(entity, resolver, geometry);
    }
  }


  /**
   * filter
   * Returns a result Array containing the non-hidden entities
   * @param   entities  Array of Entities
   * @param   resolver  Graph
   * @return  Array of non-hidden entities
   */
  filter(entities, resolver) {
    if (!this._hidden.size) return entities;

    var result = [];
    for (const entity of entities) {
      if (!this.isHidden(entity, resolver, entity.geometry(resolver))) {
        result.push(entity);
      }
    }
    return result;
  }


  /**
   * forceVisible
   * Adds the given entityIDs to the _forceVisible Set
   * This is usually done temporarily so that users can see stuff as they edit
   * that might otherwise be hidden
   * @param   entityIDs  Array of Entity ids
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
   * @param  currParams   Map(key -> value) of the current hash parameters
   * @param  prevParams   Map(key -> value) of the previous hash parameters
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
      for (const [key, rule] of this._rules) {
        if (rule.enabled && toDisableIDs.has(key)) {
          rule.enabled = false;
          didChange = true;
        } else if (!rule.enabled && !toDisableIDs.has(key)) {
          rule.enabled = true;
          didChange = true;
        }
      }

      if (didChange) {
        this._update();
      }
    }
  }


  /**
   *  _update
   *  Called whenever the enabled/disabled rules change
   *  Used to push changes in state to the urlhash and the localStorage
   */
  _update() {
    // gather hidden
    this._hidden = new Set();
    for (const [key, rule] of this._rules) {
      if (!rule.enabled) {
        this._hidden.add(key);
      }
    }
    const ruleIDs = [...this._hidden].join(',');

    // update url hash
    const urlhash = this.context.systems.urlhash;
    urlhash.setParam('disable_features', ruleIDs.length ? ruleIDs : null);

    // update localstorage
    const storage = this.context.systems.storage;
    storage.setItem('disabled-features', ruleIDs);

    this.emit('filterchange');
  }


  // filter rules

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
    );
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
      !this._isAerialway(tags);
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
    );
  }

  _isRail(tags) {
    return (
      !!tags.railway || tags.landuse === 'railway'
    ) && !(
      traffic_roads[tags.highway] ||
      service_roads[tags.highway] ||
      paths[tags.highway]
    );
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
    return !!tags.power;
  }

  // contains a past/future tag, but not in active use as a road/path/cycleway/etc..
  _isPastFuture(tags) {
    if (traffic_roads[tags.highway] || service_roads[tags.highway] || paths[tags.highway] ) {
      return false;
    }

    for (const k of Object.keys(tags)) {
      if (osmLifecyclePrefixes[k] || osmLifecyclePrefixes[tags[k]]) return true;
    }
    return false;
  }

  // Lines or areas that don't match another feature filter.
  // IMPORTANT: The 'others' feature must be the last one defined,
  // so that code in getMatches can skip this test if `hasMatch = true`
  _isOther(tags, geometry) {
    return (geometry === 'line' || geometry === 'area');
  }
}
