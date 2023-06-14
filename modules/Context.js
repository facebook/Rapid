import { EventEmitter } from '@pixi/utils';
import { select as d3_select } from 'd3-selection';
import { Projection, geoScaleToZoom } from '@rapid-sdk/math';
import { utilStringQs, utilUnicodeCharsTruncated } from '@rapid-sdk/util';
import debounce from 'lodash-es/debounce';

import { behaviors } from './behaviors';
import { modes } from './modes';
import { modeSelect } from './modes/select';   // legacy
import { services } from './services';
import { systems } from './core';

import { utilKeybinding } from './util';

const MINZOOM = 15;
const TILESIZE = 256;


/**
 * `Context` contains all the global application state for Rapid
 *  and contains references to all the core components.
 *
 * Events available:
 *   'modechange'   Fires when changing modes - receives the new mode
 */
export class Context extends EventEmitter {

  /**
   * @constructor
   */
  constructor() {
    super();

    this.version = '2.0.3';
    this.privacyVersion = '20201202';

    // `this.initialHashParams` is older, try to use `this.urlHashSystem()` instead
    this.initialHashParams = window.location.hash ? utilStringQs(window.location.hash) : {};
    this.defaultChangesetComment = this.initialHashParams.comment;
    this.defaultChangesetSource = this.initialHashParams.source;
    this.defaultChangesetHashtags = this.initialHashParams.hashtags;

    this.maxCharsForTagKey = 255;
    this.maxCharsForTagValue = 255;
    this.maxCharsForRelationRole = 255;

    // Assets
    this.assetPath = '';
    this.assetMap = {};

    // Projection
    this.projection = new Projection();

    // "Systems" are the core components of Rapid.
    this.systems = systems.instantiated;  // Map (systemID -> System)
    this._dataLoaderSystem = null;
    this._editSystem = null;
    this._filterSystem = null;
    this._imagerySystem = null;
    this._localizationSystem = null;
    this._locationSystem = null;
    this._mapSystem = null;
    this._map3dSystem = null;
    this._photoSystem = null;
    this._presetSystem = null;
    this._rapidSystem = null;
    this._storageSystem = null;
    this._uiSystem = null;
    this._uploaderSystem = null;
    this._urlHashSystem = null;
    this._validationSystem = null;

    // "Modes" are editing tasks that the user are allowed to perform.
    // Each mode is exclusive, i.e only one mode can be active at a time.
    this.modes = modes.instantiated;  // Map (modeID -> Mode)
    this._currMode = null;

    // "Behaviors" are bundles of event handlers that we can
    // enable and disable depending on what the user is doing.
    this.behaviors = behaviors.instantiated;  // Map (behaviorID -> Behavior)

    // "Services" are components that get data from other places
    this.services = services.instantiated;  // Map (serviceID -> Service)


    // User interface and keybinding
    // AFAICT `lastPointerType` is just used to localize the intro? for now - instead get this from pixi?
    // this.lastPointerType = () => _uiSystem.lastPointerType;
    this.lastPointerType = 'mouse';
    this._keybinding = utilKeybinding('context');
    d3_select(document).call(this._keybinding);

    // Connection
    this._preauth = null;
    this._apiConnections = null;
    this._prelocale = null;

    // Copy/Paste
    this._copyGraph = null;
    this._copyIDs = [];
    this._copyLoc = null;

    // Debug
    this._debugFlags = {
      tile: false,        // tile boundaries
      label: false,       // label placement
      imagery: false,     // imagery bounding polygons
      target: false,      // touch targets
      downloaded: false   // downloaded data from osm
    };

    // Container
    this._container = d3_select(null);
    this._embed = null;

    // true/false whether we are in the intro walkthrough
    this.inIntro = false;

    // Ensure methods used as callbacks always have `this` bound correctly.
    this.save = this.save.bind(this);

    // Debounce save, since it's a synchronous localStorage write,
    // and history changes can happen frequently (e.g. when dragging).
    this.debouncedSave = debounce(this.save, 350);
  }


  /**
   * init
   * Call one time to start up Rapid
   */
  init() {
    const withDebouncedSave = (fn) => {
      return (...args) => {
        const result = fn.apply(this._editSystem, args);
        this.debouncedSave();
        return result;
      };
    };


    // Instantiate all the core classes
    // These are dynamic and should be safe to instantiate in any order.
    for (const [systemID, System] of systems.available) {
      const mode = new System(this);
      systems.instantiated.set(systemID, mode);
    }

    // Connect the wires
    this._dataLoaderSystem = this.systems.get('data');
    this._editSystem = this.systems.get('edits');
    this._filterSystem = this.systems.get('filters');
    this._imagerySystem = this.systems.get('imagery');
    this._localizationSystem = this.systems.get('l10n');
    this._locationSystem = this.systems.get('locations');
    this._mapSystem = this.systems.get('map');
    this._map3dSystem = this.systems.get('map3d');
    this._photoSystem = this.systems.get('photos');
    this._presetSystem = this.systems.get('presets');
    this._rapidSystem = this.systems.get('rapid');
    this._storageSystem = this.systems.get('storage');
    this._uiSystem = this.systems.get('ui');
    this._uploaderSystem = this.systems.get('uploader');
    this._urlHashSystem = this.systems.get('urlhash');
    this._validationSystem = this.systems.get('validator');

    // EditSystem
    this.graph = this._editSystem.graph;
    this.hasEntity = (id) => this._editSystem.graph().hasEntity(id);
    this.entity = (id) => this._editSystem.graph().entity(id);
    this.pauseChangeDispatch = this._editSystem.pauseChangeDispatch;
    this.resumeChangeDispatch = this._editSystem.resumeChangeDispatch;
    this.perform = withDebouncedSave(this._editSystem.perform);
    this.replace = withDebouncedSave(this._editSystem.replace);
    this.pop = withDebouncedSave(this._editSystem.pop);
    this.overwrite = withDebouncedSave(this._editSystem.overwrite);
    this.undo = withDebouncedSave(this._editSystem.undo);
    this.redo = withDebouncedSave(this._editSystem.redo);

    // LocalizationSystem
    this.t = this._localizationSystem.t;
    this.tHtml = this._localizationSystem.tHtml;
    this.tAppend = this._localizationSystem.tAppend;

    // FilterSystem
    this.hasHiddenConnections = (entityID) => {
      const graph = this._editSystem.graph();
      const entity = graph.entity(entityID);
      return this._filterSystem.hasHiddenConnections(entity, graph);
    };

    // MapSystem
    this.deferredRedraw = this._mapSystem.deferredRedraw;
    this.immediateRedraw = this._mapSystem.immediateRedraw;
    this.scene = () => this._mapSystem.scene;
    this.surface = () => this._mapSystem.surface;
    this.surfaceRect = () => this._mapSystem.surface.node().getBoundingClientRect();
    this.editable = () => {
      const mode = this._currMode;
      if (!mode || mode.id === 'save') return false;      // don't allow editing during save
      return true;  // this._mapSystem.editableDataEnabled();  // todo: disallow editing if OSM layer is off
    };

    for (const [modeID, Mode] of modes.available) {
      const mode = new Mode(this);
      modes.instantiated.set(modeID, mode);
    }

    for (const [behaviorID, Behavior] of behaviors.available) {
      const behavior = new Behavior(this);
      behaviors.instantiated.set(behaviorID, behavior);
    }

    if (!window.mocha) {
      for (const [serviceID, Service] of services.available) {
        const service = new Service(this);
        services.instantiated.set(serviceID, service);
      }
    }


    // Initialize core systems
    // Call .init() functions to start setting everything up.
    // At this step all core object are instantiated and they may access context.
    // They may start listening to events, but they should not call each other.
    // The order of .init() may matter here if dependents make calls to each other.
    // The UI is the final thing that gets initialized.
    this._storageSystem.init();
    this._dataLoaderSystem.init();

    if (this.initialHashParams.presets) {
      const presetIDs = this.initialHashParams.presets.split(',').map(s => s.trim()).filter(Boolean);
      this._presetSystem.addablePresetIDs = new Set(presetIDs);
    }
    let overrideLocale =  this.initialHashParams.locale ?? this._prelocale;
    if (overrideLocale) {
      this._localizationSystem.preferredLocaleCodes = overrideLocale;
    }

    // kick off some async work
    this._localizationSystem.initAsync();
    this._presetSystem.initAsync();

    for (const service of this.services.values()) {
      service.init();
    }

    // Setup the connection if we have preauth credentials to use
    const osm = this.services.get('osm');
    if (osm && this._preauth) {
      osm.switch(this._preauth);
    }

    this._uiSystem.init();
    this._editSystem.init();
    this._filterSystem.init();
    this._imagerySystem.init();
    this._locationSystem.init();
    this._mapSystem.init();       // watch out - init doesn't actually create the renderer :(
    this._rapidSystem.init();
    this._uploaderSystem.init();
    this._validationSystem.init();

    // If the container isn't available, e.g. when testing, don't load the UI
    if (!this._container.empty()) {
      this._uiSystem.ensureLoaded()
        .then(() => {
          this._map3dSystem.init();
          this._photoSystem.init();
          this._urlHashSystem.init();  // tries to adjust map transform
        });
    }

  }


  /**
   * reset
   * Called after completing an edit session to reset any internal state
   */
  reset() {
    this.debouncedSave.cancel();

    for (const service of this.services.values()) {
      service.reset();
    }

    for (const system of this.systems.values()) {
      system.reset();
    }

    // don't leave stale state in the inspector
    this._container.select('.inspector-wrap *').remove();
  }


  // accessors
  dataLoaderSystem()    { return this._dataLoaderSystem; }
  editSystem()          { return this._editSystem; }
  history()             { return this._editSystem; }       // legacy name
  filterSystem()        { return this._filterSystem; }
  imagerySystem()       { return this._imagerySystem; }
  localizationSystem()  { return this._localizationSystem; }
  locationSystem()      { return this._locationSystem; }
  mapSystem()           { return this._mapSystem; }
  map3dSystem()         { return this._map3dSystem; }
  photoSystem()         { return this._photoSystem; }
  presetSystem()        { return this._presetSystem; }
  rapidSystem()         { return this._rapidSystem; }
  storageSystem()       { return this._storageSystem; }
  uiSystem()            { return this._uiSystem; }
  ui()                  { return this._uiSystem; }         // legacy name
  uploaderSystem()      { return this._uploaderSystem; }
  urlHashSystem()       { return this._urlHashSystem; }
  validationSystem()    { return this._validationSystem; }

  // not a system yet, but should be one
  keybinding()          { return this._keybinding; }


  /* Connection */
  get preauth()         { return this._preauth; }
  set preauth(options)  { this._preauth = Object.assign({}, options); }   // copy and remember for init time

  /* connection options for source switcher (optional) */
  get apiConnections()     { return this._apiConnections; }
  set apiConnections(arr)  { this._apiConnections = arr; }

  // A String or Array of locale codes to prefer over the browser's settings
  get locale()     { return this._prelocale; }
  set locale(val)  { this._prelocale = val; }    // remember for init time


  _afterLoad(cid, callback) {
    return (err, result) => {
      const osm = this.services.get('osm');
      if (err) {
        // 400 Bad Request, 401 Unauthorized, 403 Forbidden..
        if (err.status === 400 || err.status === 401 || err.status === 403) {
          osm?.logout();
        }
        if (typeof callback === 'function') {
          callback(err);
        }
        return;

      } else if (osm?.connectionID !== cid) {
        if (typeof callback === 'function') {
          callback({ message: 'Connection Switched', status: -1 });
        }
        return;

      } else {
        this._editSystem.merge(result.data, result.seenIDs);
        if (typeof callback === 'function') {
          callback(err, result);
        }
        return;
      }
    };
  }


  loadTiles(projection, callback) {
    const osm = this.services.get('osm');
    if (!osm) return;

    const z = geoScaleToZoom(projection.scale(), TILESIZE);
    if (z < MINZOOM) return;  // this would fire off too many API requests

    if (this.editable()) {
      const cid = osm.connectionID;
      osm.loadTiles(projection, this._afterLoad(cid, callback));
    }
  }


  loadTileAtLoc(loc, callback) {
    const osm = this.services.get('osm');
    if (!osm) return;

    if (this.editable()) {
      const cid = osm.connectionID;
      osm.loadTileAtLoc(loc, this._afterLoad(cid, callback));
    }
  }


  // Download the full entity and its parent relations. The callback may be called multiple times.
  loadEntity(entityID, callback) {
    const osm = this.services.get('osm');
    if (!osm) return;

    const cid = osm.connectionID;
    osm.loadEntity(entityID, this._afterLoad(cid, callback));
    osm.loadEntityRelations(entityID, this._afterLoad(cid, callback));
  }


  zoomToEntity(entityID, zoomTo) {
    const entity = this.hasEntity(entityID);

    if (entity) {   // have it already
      this.enter(modeSelect(this, [entityID]));
      if (zoomTo !== false) {
        this._mapSystem.zoomTo(entity);
      }

    } else {   // need to load it first
      this.loadEntity(entityID, (err, result) => {
        if (err) return;
        const loadedEntity = result.data.find(e => e.id === entityID);
        if (!loadedEntity) return;

        this.enter(modeSelect(this, [entityID]));
        if (zoomTo !== false) {
          this._mapSystem.zoomTo(loadedEntity);
        }
      });
    }
  }


  // String length limits in Unicode characters, not JavaScript UTF-16 code units
  _cleanOsmString(val, maxChars) {
    // be lenient with input
    if (val === undefined || val === null) {
      val = '';
    } else {
      val = val.toString();
    }

    // remove whitespace
    val = val.trim();

    // use the canonical form of the string
    if (val.normalize) val = val.normalize('NFC');

    // trim to the number of allowed characters
    return utilUnicodeCharsTruncated(val, maxChars);
  }

  cleanTagKey(val)       { return this._cleanOsmString(val, this.maxCharsForTagKey); }
  cleanTagValue(val)     { return this._cleanOsmString(val, this.maxCharsForTagValue); }
  cleanRelationRole(val) { return this._cleanOsmString(val, this.maxCharsForRelationRole); }


  // Immediately save the user's history to localstorage, if possible
  // This is called sometimes, but also on the `window.onbeforeunload` handler
  save() {
    // no history save, no message onbeforeunload
    if (this.inIntro || this._container.select('.modal').size()) return;

    let canSave;
    if (this._currMode?.id === 'save') {
      canSave = false;

      // Attempt to prevent user from creating duplicate changes - see iD#5200
      const osm = this.services.get('osm');
      if (osm && osm.isChangesetInflight()) {
        this._editSystem.clearSaved();
        return;
      }

    } else {
      canSave = this.selectedIDs().every(id => {
        const entity = this.hasEntity(id);
        return entity && !entity.isDegenerate();
      });
    }

    if (canSave) {
      this._editSystem.save();
    }
    if (this._editSystem.hasChanges()) {
      return this._localizationSystem.t('save.unsaved_changes');
    }
  }


  // The current mode (`null` until ui.render initializes the map and enters browse mode)
  mode() {
    return this._currMode;
  }


  /**
   * `enter`
   * Enters the given mode, with an optional bunch of features selected.
   * If the mode could not be entered for whatever reason, falls back to entering browse mode.
   *
   * @param   `modeOrModeID`  `Object` or `String` identifying the mode to enter
   * @param   `options`        Optional `Object` of options passed to the new mode
   * @return  The mode that got entered
   */
  enter(modeOrModeID, options) {
    const currMode = this._currMode;
    let newMode;

    if (typeof modeOrModeID === 'string') {
      newMode = this.modes.get(modeOrModeID);
    } else {
      newMode = modeOrModeID;
    }
    if (!newMode) {
      console.error(`this.enter: no such mode: ${modeOrModeID}`);  // eslint-disable-line no-console
      newMode = this.modes.get('browse');  // fallback
    }

    // Exit current mode, if any
    if (currMode) {
      currMode.exit();
      this._container.classed(`mode-${currMode.id}`, false);
    }

    // Try to enter the new mode, fallback to 'browse' mode
    this._currMode = newMode;
    const didEnter = this._currMode.enter(options);
    if (!didEnter) {
      this._currMode = this.modes.get('browse');
      this._currMode.enter();
    }
    this._container.classed(`mode-${this._currMode.id}`, true);
    this.emit('modechange', this._currMode);
    return this._currMode;
  }


  /**
   * `selectedData`
   * Returns a Map containing the current selected features.  It can contain
   * multiple items of various types (e.g. some OSM data, some Rapid data etc)
   *
   * @return  The current selected features, as a `Map(datumID -> datum)`
   */
  selectedData() {
    if (!this._currMode) return new Map();
    return this._currMode.selectedData || new Map();
  }

  /**
   * `selectedIDs`
   * @return  Just the keys of the `selectedData`
   */
  selectedIDs() {
    if (!this._currMode) return [];
    if (typeof this._currMode.selectedIDs === 'function') {
      return this._currMode.selectedIDs();         // class function
    } else {
      return this._currMode.selectedIDs || [];     // class property
    }
  }

  selectedNoteID() {
    console.error('deprecated: do not call context.selectedNoteID anymore');   // eslint-disable-line no-console
    return null;
  }
  selectedErrorID() {
    console.error('deprecated: do not call context.selectedErrorID anymore');   // eslint-disable-line no-console
    return null;
  }


  /**
   * `enableBehaviors`
   * The given behaviorIDs will be enabled, all others will be disabled
   * @param   `enableIDs`  `Array` or `Set` containing behaviorIDs to keep enabled
   */
  enableBehaviors(enableIDs) {
    if (!(enableIDs instanceof Set)) {
      enableIDs = new Set([].concat(enableIDs));  // coax ids into a Set
    }

    for (const [behaviorID, behavior] of this.behaviors) {
      if (enableIDs.has(behaviorID)) {  // should be enabled
        if (!behavior.enabled) {
          behavior.enable();
        }
      } else {  // should be disabled
        if (behavior.enabled) {
          behavior.disable();
        }
      }
    }
  }


  // Copy/Paste
  get copyGraph()     { return this._copyGraph; }
  set copyGraph(val)  { this._copyGraph = val; }

  get copyIDs() { return this._copyIDs; }
  set copyIDs(val) {
    this._copyIDs = val;
    this._copyGraph = this._editSystem.graph();
  }

  get copyLoc()     { return this._copyLoc; }
  set copyLoc(val)  { this._copyLoc = val; }


  // Debug
  debugFlags() {
    return this._debugFlags;
  }
  getDebug(flag) {
    return flag && this._debugFlags[flag];
  }
  setDebug(flag, val = true) {
    this._debugFlags[flag] = val;
    if (this._mapSystem?.renderer) {
      this._mapSystem.immediateRedraw();
    }
  }


  // Container
  container(val) {
    if (val === undefined) return this._container;
    this._container = val;
    this._container.classed('ideditor', true);
    return this;
  }

  get containerNode() {
    return this._container.node();
  }
  set containerNode(val) {
    this.container(d3_select(val));
  }

  embed(val) {
    if (val === undefined) return this._embed;
    this._embed = val;
    return this;
  }


  // Assets
  asset(val) {
    if (/^http(s)?:\/\//i.test(val)) return val;
    const filename = `${this.assetPath}${val}`;
    return this.assetMap[filename] || filename;
  }

  imagePath(val) {
    console.error('deprecated: do not call context.imagePath anymore');   // eslint-disable-line no-console
    return this.asset(`img/${val}`);
  }

}
