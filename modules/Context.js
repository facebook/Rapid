import { EventEmitter } from '@pixi/utils';
import { select as d3_select } from 'd3-selection';
import { Viewport } from '@rapid-sdk/math';
import { utilUnicodeCharsTruncated } from '@rapid-sdk/util';

import { behaviors } from './behaviors/index.js';
import { modes } from './modes/index.js';
import { services } from './services/index.js';
import { systems } from './core/index.js';

import { utilKeybinding } from './util/keybinding.js';

const MINZOOM = 15;


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

    this.version = '2.3.2';     // see https://semver.org/ for examples

    // If user has not seen this version of our software, we will show them a modal at startup.
    // Just bump these dates to a higher number to get the screen to come back.
    this.privacyVersion = 20201202;   // whether to show the "welcome" screen
    this.whatsNewVersion = 20240507;  // whether show the "what's new" screen

    // These may be set by our continuous deployment scripts, or left empty
    this.buildID = '';
    this.buildSHA = '';
    this.buildDate = '';

    this.maxCharsForTagKey = 255;
    this.maxCharsForTagValue = 255;
    this.maxCharsForRelationRole = 255;

    // Assets
    this.assetOrigin = null;
    this.assetPath = null;
    this.assetMap = null;

    // Viewport (was: Projection)
    this.viewport = new Viewport();

    // "Systems" are the core components of Rapid.
    this.systems = {};

    // "Modes" are editing tasks that the user are allowed to perform.
    // Each mode is exclusive, i.e. only one mode can be active at a time.
    this.modes = {};
    this._currMode = null;

    // "Behaviors" are bundles of event handlers that we can
    // enable and disable depending on what the user is doing.
    this.behaviors = {};

    // "Services" are components that get data from other places
    this.services = {};


    this._initPromise = null;
    this._resetPromise = null;


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
  }


  /**
   * initAsync
   * Call one time to start up Rapid
   * @return {Promise} Promise resolved when Rapid is ready
   */
  initAsync() {
    if (this._initPromise) return this._initPromise;

    // -------------------------------
    // Construct all the core classes
    // -------------------------------
    for (const [id, System] of systems.available) {
      this.systems[id] = new System(this);
    }

    // AssetSystem
    const assets = this.systems.assets;
    if (this.assetOrigin)  assets.origin = this.assetOrigin;
    if (this.assetPath)    assets.filePath = this.assetPath;
    if (this.assetMap)     assets.fileReplacements = this.assetMap;

    // LocalizationSystem
    const l10n = this.systems.l10n;
    if (this._prelocale) {   // set preferred locale codes, if we have them
      l10n.preferredLocaleCodes = this._prelocale;
    }

    // FilterSystem
    const filters = this.systems.filters;
    this.hasHiddenConnections = (entityID) => {
      const editor = this.systems.editor;
      const graph = editor.staging.graph;
      const entity = graph.entity(entityID);
      return filters.hasHiddenConnections(entity, graph);
    };

    // MapSystem
    const map = this.systems.map;
    this.deferredRedraw = map.deferredRedraw;
    this.immediateRedraw = map.immediateRedraw;
    this.scene = () => map.scene;
    this.surface = () => map.surface;
    this.surfaceRect = () => map.surface.node().getBoundingClientRect();
    this.editable = () => {
      const mode = this._currMode;
      if (!mode || mode.id === 'save') return false;      // don't allow editing during save
      return true;  // map.editableDataEnabled();  // todo: disallow editing if OSM layer is off
    };


    for (const [id, Mode] of modes.available) {
      this.modes[id] = new Mode(this);
    }

    for (const [id, Behavior] of behaviors.available) {
      this.behaviors[id] = new Behavior(this);
    }

    if (!window.mocha) {
      for (const [id, Service] of services.available) {
        this.services[id] = new Service(this);
      }
    }


    // ---------------------------------
    // Initialize all the core classes
    // ---------------------------------
    const allSystems = Object.values(this.systems);
    const allServices = Object.values(this.services);

    return this._initPromise = Promise.resolve()
      .then(() => Promise.all( allSystems.map(s => s.initAsync()) ))
      .then(() => Promise.all( allServices.map(s => s.initAsync()) ))
      .then(() => {
        // Setup the osm connection if we have preauth credentials to use
        const osm = this.services.osm;
        return (osm && this._preauth) ? osm.switchAsync(this._preauth) : Promise.resolve();
      })
      .then(() => Promise.all( allSystems.map(s => s.autoStart ? s.startAsync() : Promise.resolve()) ))
      .then(() => Promise.all( allServices.map(s => s.autoStart ? s.startAsync() : Promise.resolve()) ));
  }


  /**
   * resetAsync
   * Call after completing an edit session to reset any intenal state
   * @return {Promise} Promise resolved when Rapid is finished resetting
   */
  resetAsync() {
    if (this._resetPromise) return this._resetPromise;

    const allSystems = Object.values(this.systems);
    const allServices = Object.values(this.services);

    return this._resetPromise = Promise.resolve()
      .then(() => Promise.all( allSystems.map(s => s.resetAsync()) ))
      .then(() => Promise.all( allServices.map(s => s.resetAsync()) ))
      .finally(() => this._resetPromise = null);
  }


  // not a system yet, but should be one
  keybinding()  { return this._keybinding; }


  /* Connection */
  get preauth()         { return this._preauth; }
  set preauth(options)  { this._preauth = Object.assign({}, options); }   // copy and remember for init time

  /* connection options for source switcher (optional) */
  get apiConnections()     { return this._apiConnections; }
  set apiConnections(arr)  { this._apiConnections = arr; }

  // A String or Array of locale codes to prefer over the browser's settings
// TODO: For now, this must be set before init, and it will be passed
// to the LocalizationSystem after it has been created but before init.
// We should deprecate setting the locale through Context like this.
// Other methods that locale can be set include:
//  - `locale` param in the urlhash or
//  - directly accessing the LocalizationSystem
// and both of _those_ should be made dynamic so locale can switch while Rapid is running
  get locale()     { return this._prelocale; }
  set locale(val)  { this._prelocale = val; }    // remember for init time


  _afterLoad(cid, callback) {
    return (err, result) => {
      const osm = this.services.osm;
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
        this.systems.editor.merge(result.data, result.seenIDs);
        if (typeof callback === 'function') {
          callback(err, result);
        }
        return;
      }
    };
  }


  loadTiles(callback) {
    const osm = this.services.osm;
    if (!osm) return;

    const z = this.viewport.transform.zoom;
    if (z < MINZOOM) return;  // this would fire off too many API requests

    if (this.editable()) {
      const cid = osm.connectionID;
      osm.loadTiles(this._afterLoad(cid, callback));
    }
  }


  loadTileAtLoc(loc, callback) {
    const osm = this.services.osm;
    if (!osm) return;

    if (this.editable()) {
      const cid = osm.connectionID;
      osm.loadTileAtLoc(loc, this._afterLoad(cid, callback));
    }
  }


  // Download the full entity and its parent relations. The callback may be called multiple times.
  loadEntity(entityID, callback) {
    const osm = this.services.osm;
    if (!osm) return;

    const cid = osm.connectionID;
    osm.loadEntity(entityID, this._afterLoad(cid, callback));
    osm.loadEntityRelations(entityID, this._afterLoad(cid, callback));
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


  /**
   * mode
   * Gets the current mode (`null` until UiSystem.render initializes the map and enters browse mode)
   * @return the current mode
   * @readonly
   */
  get mode() {
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
      newMode = this.modes[modeOrModeID];
    } else {
      newMode = modeOrModeID;
    }
    if (!newMode) {
      console.error(`context.enter: no such mode: ${modeOrModeID}`);  // eslint-disable-line no-console
      newMode = this.modes.browse;  // fallback
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
      this._currMode = this.modes.browse;
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
    return this._currMode.selectedIDs || [];
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

    for (const [behaviorID, behavior] of Object.entries(this.behaviors)) {
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
    this._copyGraph = this.systems.editor.staging.graph;
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
    this.systems.map?.immediateRedraw();
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

}
