import { utilArrayUniq } from '@rapid-sdk/util';

import { AbstractSystem } from './AbstractSystem.js';
import { osmNodeGeometriesForTags, osmSetAreaKeys, osmSetPointTags, osmSetVertexTags } from '../osm/tags.js';
import { Category, Collection, Field, Preset } from './lib/index.js';
import { uiFields } from '../ui/fields/index.js';

const VERBOSE = true;        // warn about v6 preset features we don't support currently
const MAXRECENTS = 30;       // how many recents to store in localstorage
const MAXRECENTS_SHOW = 6;   // how many recents to show on the preset list


/**
 * `PresetSystem` maintains an internal index of all the presets, fields, and categories.
 */
export class PresetSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  context  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'presets';
    this.dependencies = new Set(['assets', 'l10n', 'locations', 'storage', 'urlhash']);
    this.geometries = ['point', 'vertex', 'line', 'area', 'relation'];

    // Create geometry fallbacks
    const POINT = new Preset(context, 'point', { name: 'Point', tags: {}, geometry: ['point', 'vertex'], matchScore: 0.1 } );
    const LINE = new Preset(context, 'line', { name: 'Line', tags: {}, geometry: ['line'], matchScore: 0.1 } );
    const AREA = new Preset(context, 'area', { name: 'Area', tags: { area: 'yes' }, geometry: ['area'], matchScore: 0.1 } );
    const RELATION = new Preset(context, 'relation', { name: 'Relation', tags: {}, geometry: ['relation'], matchScore: 0.1 } );

    // Collection of all Presets and Categories
    this.collection = new Collection(context, [POINT, LINE, AREA, RELATION]);

    // Defaults are the Presets and Categories offered to the user when adding a new feature.
    // A fallback preset is appended to the list automatically so they dont need to be included here.
    this._defaults = {
      point: [],
      vertex: [],
      line: [],
      area: [],
      relation: []
    };

    this._presets = { point: POINT, line: LINE, area: AREA, relation: RELATION };
    this._fields = {};
    this._categories = {};
    this._universal = [];
    this._recentIDs = null;

    // Set of presetIDs that the user can add (if null, all are normally addable)
    this.addablePresetIDs = null;

    // Index of presets by (geometry, tag key).
    this._geometryIndex = { point: {}, vertex: {}, line: {}, area: {}, relation: {} };
    this._initPromise = null;
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
    const urlhash = this.context.systems.urlhash;
    const prerequisites = Promise.all([
      assets.initAsync(),
      urlhash.initAsync()
    ]);

    return this._initPromise = prerequisites
      .then(() => {
        // If we received a subset of addable presetIDs specified in the url hash, save them.
        const presetIDs = urlhash.initialHashParams.get('presets');
        if (presetIDs) {
          const arr = presetIDs.split(',').map(s => s.trim()).filter(Boolean);
          this.addablePresetIDs = new Set(arr);
        }

        // Fetch the preset data
        return Promise.all([
          assets.loadAssetAsync('tagging_preset_categories'),
          assets.loadAssetAsync('tagging_preset_defaults'),
          assets.loadAssetAsync('tagging_preset_presets'),
          assets.loadAssetAsync('tagging_preset_fields'),
          assets.loadAssetAsync('tagging_preset_overrides')   // customizations to merge in after the id-tagging-schema
        ]);
      })
      .then(vals => {
        this.merge({ categories: vals[0], defaults: vals[1], presets: vals[2], fields: vals[3] });
        this.merge(vals[4]);
        osmSetAreaKeys(this.areaKeys());
        osmSetPointTags(this.pointTags());
        osmSetVertexTags(this.vertexTags());
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
    return Promise.resolve();
  }


  /**
   * merge
   * Accepts an object containing new preset data (all properties optional):
   * {
   *   fields: {},               // fieldID -> fieldData
   *   presets: {},              // presetID -> presetData
   *   categories: {},           // categoryID -> categoryData
   *   defaults: {},             // geometry -> Array(presetIDs)
   *   featureCollection: {}     // GeoJSON
   * }
   */
  merge(src) {
    let newLocationSets = [];
    const context = this.context;
    const locationSystem = context.systems.locations;

    // Merge Fields
    if (src.fields) {
      for (const [fieldID, f] of Object.entries(src.fields)) {
        if (f) {   // add or replace
          if (!uiFields[f.type]) {
            if (VERBOSE) console.warn(`"${f.type}" type not supported for ${fieldID}`);  // eslint-disable-line no-console
            continue;
          }
          const field = new Field(context, fieldID, f, this._fields);
          if (field.locationSet) newLocationSets.push(field);
          this._fields[fieldID] = field;

        } else {   // remove
          delete this._fields[fieldID];
        }
      }
    }

    // Merge Presets
    if (src.presets) {
      for (const [presetID, p] of Object.entries(src.presets)) {
        const existing = this._presets[presetID];
        const isFallback = existing?.isFallback();

        if (p) {   // add or replace

// Rename icon identifiers to match the rapid spritesheet
if (p.icon) p.icon = p.icon.replace(/^iD-/, 'rapid-');

// A few overrides to use better icons than the ones provided by the id-tagging-schema project
if (presetID === 'address')                         p.icon = 'maki-circle-stroked';
if (presetID === 'highway/turning_loop')            p.icon = 'maki-circle';
//if (/^highway\/crossing/.test(presetID))            p.icon = 'temaki-pedestrian';
//if (/^highway\/footway\/crossing/.test(presetID))   p.icon = 'temaki-pedestrian';
if (p.icon === 'roentgen-needleleaved_tree')        p.icon = 'temaki-tree_needleleaved';
if (p.icon === 'roentgen-tree')                     p.icon = 'temaki-tree_broadleaved';

          const preset = new Preset(context, presetID, p, this._fields, this._presets);
          if (preset.locationSet) newLocationSets.push(preset);
          this._presets[presetID] = preset;

        } else if (!isFallback) {   // remove (but not if it's a fallback)
          delete this._presets[presetID];
        }
      }
    }

    // Merge Categories
    if (src.categories) {
      for (const [categoryID, c] of Object.entries(src.categories)) {
        if (c) {   // add or replace
// Rename icon identifiers to match the rapid spritesheet
if (c.icon) c.icon = c.icon.replace(/^iD-/, 'rapid-');
          const category = new Category(context, categoryID, c, this._presets);
          if (category.locationSet) newLocationSets.push(category);
          this._categories[categoryID] = category;

        } else {   // remove
          delete this._categories[categoryID];
        }
      }
    }

    // Merge Defaults
    if (src.defaults) {
      for (const [geometry, ids] of Object.entries(src.defaults)) {
        if (Array.isArray(ids)) {   // add or replace
          this._defaults[geometry] = ids
            .map(id => this._presets[id] || this._categories[id])
            .filter(item => item && !item.isFallback());
        } else {   // remove
          this._defaults[geometry] = [];
        }
      }
    }

    // Replace `this.collection` after changing Presets and Categories
    const all = Object.values(this._presets).concat(Object.values(this._categories));
    this.collection = new Collection(context, all);

    // Rebuild universal fields array
    this._universal = Object.values(this._fields).filter(field => field.universal);

    // Reset all the preset fields - they'll need to be resolved again
    Object.values(this._presets).forEach(preset => preset.resetFields());

    // Rebuild geometry index
    this._geometryIndex = { point: {}, vertex: {}, line: {}, area: {}, relation: {} };
    all.forEach(preset => {
      (preset.geometry || []).forEach(geometry => {
        let g = this._geometryIndex[geometry];
        for (let key in preset.tags) {
          g[key] = g[key] || {};
          let value = preset.tags[key];
          (g[key][value] = g[key][value] || []).push(preset);
        }
      });
    });

    // Merge Custom Features
    if (src.featureCollection && Array.isArray(src.featureCollection.features)) {
      locationSystem.mergeCustomGeoJSON(src.featureCollection);
    }

    // Resolve all locationSet features.
    if (newLocationSets.length) {
      locationSystem.mergeLocationSets(newLocationSets);
    }

    return this;
  }


  item(id)                      { return this.collection.item(id); }
  index(id)                     { return this.collection.index(id); }
  fallback(geometry)            { return this.collection.fallback(geometry); }
  matchGeometry(geometry)       { return this.collection.matchGeometry(geometry); }
  matchAllGeometry(geometries)  { return this.collection.matchAllGeometry(geometries); }
  search(value, geometry, loc)  { return this.collection.search(value, geometry, loc); }


  /**
   * match
   * @param   entity
   * @param   resolver
   * @return  Preset that best matches
   */
  match(entity, resolver) {
    return resolver.transient(entity, 'presetMatch', () => {
      let geometry = entity.geometry(resolver);
      // Treat entities on addr:interpolation lines as points, not vertices - iD#3241
      if (geometry === 'vertex' && entity.isOnAddressLine(resolver)) {
        geometry = 'point';
      }
      const entityExtent = entity.extent(resolver);
      return this.matchTags(entity.tags, geometry, entityExtent.center());
    });
  }


  /**
   * matchTags
   * @param   tags
   * @param   geometry
   * @param   loc
   * @return  Preset that best matches
   */
  matchTags(tags, geometry, loc) {
    const keyIndex = this._geometryIndex[geometry];
    let bestScore = -1;
    let bestMatch;
    let matchCandidates = [];

    for (let k in tags) {
      let indexMatches = [];

      let valueIndex = keyIndex[k];
      if (!valueIndex) continue;

      let keyValueMatches = valueIndex[tags[k]];
      if (keyValueMatches) indexMatches.push(...keyValueMatches);
      let keyStarMatches = valueIndex['*'];
      if (keyStarMatches) indexMatches.push(...keyStarMatches);

      if (indexMatches.length === 0) continue;

      for (let i = 0; i < indexMatches.length; i++) {
        const candidate = indexMatches[i];
        const score = candidate.matchScore(tags);
        if (score === -1) continue;

        matchCandidates.push({score, candidate});

        if (score > bestScore) {
          bestScore = score;
          bestMatch = candidate;
        }
      }
    }

    const locationSystem = this.context.systems.locations;
    if (bestMatch && bestMatch.locationSetID && bestMatch.locationSetID !== '+[Q2]' && Array.isArray(loc)) {
      const validHere = locationSystem.locationSetsAt(loc);
      if (!validHere[bestMatch.locationSetID]) {
        matchCandidates.sort((a, b) => (a.score < b.score) ? 1 : -1);
        for (let i = 0; i < matchCandidates.length; i++){
          const candidateScore = matchCandidates[i];
          if (!candidateScore.candidate.locationSetID || validHere[candidateScore.candidate.locationSetID]) {
            bestMatch = candidateScore.candidate;
            bestScore = candidateScore.score;
            break;
          }
        }
      }
    }

    // If any part of an address is present, allow fallback to "Address" preset - iD#4353
    if (!bestMatch || bestMatch.isFallback()) {
      for (let k in tags) {
        if (/^addr:/.test(k) && keyIndex['addr:*'] && keyIndex['addr:*']['*']) {
          bestMatch = keyIndex['addr:*']['*'][0];
          break;
        }
      }
    }

    return bestMatch || this.fallback(geometry);
  }


  /**
   * allowsVertex
   * @param   entity
   * @param   resolver
   * @return  `true` if this entity can be a vertex, `false` if not
   */
  allowsVertex(entity, resolver) {
    if (entity.type !== 'node') return false;
    if (Object.keys(entity.tags).length === 0) return true;

    return resolver.transient(entity, 'vertexMatch', () => {
      // address lines allow vertices to act as standalone points
      if (entity.isOnAddressLine(resolver)) return true;

      const geometries = osmNodeGeometriesForTags(entity.tags);
      if (geometries.vertex) return true;
      if (geometries.point) return false;
      // allow vertices for unspecified points
      return true;
    });
  }


  /**
   * areaKeys
   * Because of the open nature of tagging, we will never have a complete
   * list of tags used in OSM, so we want it to have logic like "assume
   * that a closed way with an amenity tag is an area, unless the amenity
   * is one of these specific types". This function computes a structure
   * that allows testing of such conditions, based on the presets designated
   * as as supporting (or not supporting) the area geometry.
   *
   * The returned object L is a keeplist/discardlist of tags. A closed way
   * with a tag (k, v) is considered to be an area if `k in L && !(v in L[k])`
   * (see `Way#isArea()`). In other words, the keys of L form the keeplist,
   * and the subkeys form the discardlist.
   *
   * @returns  areaKeys Object
   */
  areaKeys() {
    // The ignore list is for keys that imply lines. (We always add `area=yes` for exceptions)
    const ignore = ['barrier', 'highway', 'footway', 'railway', 'junction', 'type'];
    let areaKeys = {};

    // ignore name-suggestion-index and deprecated presets
    const presets = Object.values(this._presets).filter(p => !p.suggestion && !p.replacement);

    // keeplist
    for (const p of presets) {
      const k = Object.keys(p.tags)[0];  // pick the first tag
      if (!k) continue;
      if (ignore.includes(k)) continue;

      if (p.geometry.includes('area')) {    // probably an area..
        areaKeys[k] = areaKeys[k] || {};
      }
    }

    // discardlist
    for (const p of presets) {
      if (!p.geometry.includes('line')) continue;
      for (const [k, v] of Object.entries(p.addTags)) {
        // examine all addTags to get a better sense of what can be tagged on lines - iD#6800
        // probably an area... but sometimes a line.
        if (k in areaKeys && v !== '*') {
          areaKeys[k][v] = true;
        }
      }
    }

    return areaKeys;
  }


  pointTags() {
    let pointTags = {};

    // ignore name-suggestion-index and deprecated presets
    const presets = Object.values(this._presets).filter(p => !p.suggestion && !p.replacement && p.searchable !== false);

    for (const p of presets) {
      if (!p.geometry.includes('point')) continue;

      const k = Object.keys(p.tags)[0];    // pick the first tag
      const v = Object.values(p.tags)[0];  // pick the first tag
      if (!k || !v) continue;

      pointTags[k] = pointTags[k] || {};
      pointTags[k][v] = true;
    }

    return pointTags;
  }


  vertexTags() {
    let vertexTags = {};

    // ignore name-suggestion-index and deprecated presets
    const presets = Object.values(this._presets).filter(p => !p.suggestion && !p.replacement && p.searchable !== false);

    for (const p of presets) {
      if (!p.geometry.includes('vertex')) continue;

      const k = Object.keys(p.tags)[0];    // pick the first tag
      const v = Object.values(p.tags)[0];  // pick the first tag
      if (!k || !v) continue;

      vertexTags[k] = vertexTags[k] || {};
      vertexTags[k][v] = true;
    }

    return vertexTags;
  }


  field(id) {
    return this._fields[id];
  }

  universal() {
    return this._universal;
  }


  /**
   * defaults
   * Defaults are the Presets and Categories offered to the user when adding a new feature.
   * Each geometry type has its own set of defaults.
   * The fallback preset for the given geometry is appended to the list automatically.
   * @param   geometry
   * @param   limit               Integer max number of results to return
   * @param   startWithRecents    Boolean
   * @param   loc
   * @return  Collection
   */
  defaults(geometry, limit = 10, startWithRecents = true, loc = null) {
    let results = new Map();   // Map (itemID -> item)  (may be a Preset or a Category)

    if (startWithRecents) {
      for (const preset of this.getRecents()) {
        if (results.size < MAXRECENTS_SHOW && preset.matchGeometry(geometry)) {
          results.set(preset.id, preset);
        }
      }
    }

    // If there is a set of addable presetIDs, use that instead of defaults
    if (this.addablePresetIDs instanceof Set) {
      for (const itemID of this.addablePresetIDs) {
        const item = this.item(itemID);
        if (item?.matchGeometry(geometry)) {
          results.set(itemID, item);
        }
      }
    } else {
      for (const item of this._defaults[geometry]) {
        if (item.matchGeometry(geometry)) {
          results.set(item.id, item);
        }
      }
    }

    const fallback = this.fallback(geometry);
    if (fallback && !results.has(fallback.id)) {
      results.set(fallback.id, fallback);
    }

    // If a location was provided, filter results to only those valid here.
    let arr = [...results.values()];
    if (Array.isArray(loc)) {
      const locationSystem = this.context.systems.locations;
      const validHere = locationSystem.locationSetsAt(loc);
      arr = arr.filter(item => !item.locationSetID || validHere[item.locationSetID]);
    }

    return new Collection(this.context, arr.slice(0, limit - 1));
  }


  /**
   * getRecents
   * Returns the recently used presets
   * If this._recentIDs is unset, try to load them from localStorage
   * @return   An Array of recent presets
   */
  getRecents() {
    let presetIDs = this._recentIDs;
    if (!presetIDs) {  // first time, try to get them from localStorage
      const storage = this.context.systems.storage;
      presetIDs = JSON.parse(storage.getItem('preset_recents')) || [];
    }

    const presets = presetIDs
      .map(item => {
        const id = item?.id || item;  // previously we stored preset, now we just store presetID
        return this._presets[id];
      })
      .filter(Boolean);

    if (!this._recentIDs) {
      this._recentIDs = presets.map(item => item.id);
    }

    return presets;
  }


  /**
   * setMostRecent
   * Prepends a preset to the recently used presets array
   * @param   A preset to add
   */
  setMostRecent(preset) {
    if (preset.searchable === false) return;

    this._recentIDs.unshift(preset.id);   // prepend array
    this._recentIDs = utilArrayUniq(this._recentIDs).slice(0, MAXRECENTS);

    const storage = this.context.systems.storage;
    storage.setItem('preset_recents', JSON.stringify(this._recentIDs));
  }

}
