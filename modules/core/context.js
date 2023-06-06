import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { Projection, geoScaleToZoom } from '@rapid-sdk/math';
import { utilStringQs, utilUnicodeCharsTruncated } from '@rapid-sdk/util';
import _debounce from 'lodash-es/debounce';

import { DataLoaderSystem } from './DataLoaderSystem';
import { EditSystem } from './EditSystem';
import { FilterSystem } from './FilterSystem';
import { ImagerySystem } from './ImagerySystem';
import { LocalizationSystem } from './LocalizationSystem';
import { LocationSystem } from './LocationSystem';
import { MapSystem } from './MapSystem';
import { Map3dSystem } from './Map3dSystem';
import { PhotoSystem } from './PhotoSystem';
import { PresetSystem } from './PresetSystem';
import { RapidSystem } from './RapidSystem';
import { StorageSystem } from './StorageSystem';
import { UiSystem } from './UiSystem';
import { UploaderSystem } from './UploaderSystem';
import { UrlHashSystem } from './UrlHashSystem';
import { ValidationSystem } from './ValidationSystem';

import * as Behaviors from '../behaviors';
import * as Modes from '../modes';
import * as Services from '../services';
import { modeSelect } from '../modes/select';   // legacy

import { utilKeybinding, utilRebind } from '../util';



export function coreContext() {
  const dispatch = d3_dispatch('enter', 'exit');
  let context = utilRebind({}, dispatch, 'on');

  context.version = '2.0.3';
  context.privacyVersion = '20201202';

  // `context.initialHashParams` is older, try to use `context.urlHashSystem()` instead
  context.initialHashParams = window.location.hash ? utilStringQs(window.location.hash) : {};

  // Instantiate core systems
  const _dataLoaderSystem = new DataLoaderSystem(context);
  const _editSystem = new EditSystem(context);
  const _filterSystem = new FilterSystem(context);
  const _imagerySystem = new ImagerySystem(context);
  const _localizationSystem = new LocalizationSystem(context);
  const _locationSystem = new LocationSystem(context);
  const _mapSystem = new MapSystem(context);
  const _map3dSystem = new Map3dSystem(context);
  const _photoSystem = new PhotoSystem(context);
  const _presetSystem = new PresetSystem(context);
  const _rapidSystem = new RapidSystem(context);
  const _storageSystem = new StorageSystem(context);
  const _uiSystem = new UiSystem(context);
  const _uploaderSystem = new UploaderSystem(context);
  const _urlHashSystem = new UrlHashSystem(context);
  const _validationSystem = new ValidationSystem(context);

  context.dataLoaderSystem = () => _dataLoaderSystem;
  context.editSystem = () => _editSystem;
  context.history = () => _editSystem;           // legacy name
  context.filterSystem = () => _filterSystem;
  context.imagerySystem = () => _imagerySystem;
  context.localizationSystem = () => _localizationSystem;
  context.locationSystem = () => _locationSystem;
  context.mapSystem = () => _mapSystem;
  context.map3dSystem = () => _map3dSystem;
  context.photoSystem = () => _photoSystem;
  context.presetSystem = () => _presetSystem;
  context.rapidSystem = () => _rapidSystem;
  context.storageSystem = () => _storageSystem;
  context.uiSystem = () => _uiSystem;
  context.ui = () => _uiSystem;           // legacy name
  context.uploaderSystem = () => _uploaderSystem;
  context.urlHashSystem = () => _urlHashSystem;
  context.validationSystem = () => _validationSystem;

  /* EditSystem */
  context.graph = _editSystem.graph;
  context.hasEntity = (id) => _editSystem.graph().hasEntity(id);
  context.entity = (id) => _editSystem.graph().entity(id);
  context.pauseChangeDispatch = _editSystem.pauseChangeDispatch;
  context.resumeChangeDispatch = _editSystem.resumeChangeDispatch;
  context.perform = withDebouncedSave(_editSystem.perform);
  context.replace = withDebouncedSave(_editSystem.replace);
  context.pop = withDebouncedSave(_editSystem.pop);
  context.overwrite = withDebouncedSave(_editSystem.overwrite);
  context.undo = withDebouncedSave(_editSystem.undo);
  context.redo = withDebouncedSave(_editSystem.redo);

  /* LocalizationSystem */
  context.t = _localizationSystem.t;
  context.tHtml = _localizationSystem.tHtml;
  context.tAppend = _localizationSystem.tAppend;

  /* FilterSystem */
  context.hasHiddenConnections = (entityID) => {
    const graph = _editSystem.graph();
    const entity = graph.entity(entityID);
    return _filterSystem.hasHiddenConnections(entity, graph);
  };

  /* MapSystem */
  context.deferredRedraw = _mapSystem.deferredRedraw;
  context.immediateRedraw = _mapSystem.immediateRedraw;
  context.scene = () => _mapSystem.scene;
  context.surface = () => _mapSystem.surface;
  context.surfaceRect = () => _mapSystem.surface.node().getBoundingClientRect();
  context.editable = () => {
    const mode = context._currMode;
    if (!mode || mode.id === 'save') return false;      // don't allow editing during save
    return true;  // _mapSystem.editableDataEnabled();  // todo: disallow editing if OSM layer is off
  };

  // "Modes" are editing tasks that the user are allowed to perform.
  // Each mode is exclusive, i.e only one mode can be active at a time.
  context.modes = new Map();  // Map (mode.id -> Mode)
  for (const [name, Mode] of Object.entries(Modes)) {
    if (name === 'modeSelect' || name === 'modeDragNote') continue;  // legacy
    const mode = new Mode(context);
    context.modes.set(mode.id, mode);
  }

  // "Behaviors" are bundles of event handlers that we can
  // enable and disable depending on what the user is doing.
  context.behaviors = new Map();  // Map (behavior.id -> behavior)
  for (const [name, Behavior] of Object.entries(Behaviors)) {
    if (name === 'BehaviorKeyOperation') continue;   // this one won't work
    const behavior = new Behavior(context);
    context.behaviors.set(behavior.id, behavior);
  }


  // "Services" are components that get data from other places
  context.services = new Map();  // Map (service.id -> Service)
  if (!window.mocha) {
    for (const Service of Object.values(Services)) {
      const service = new Service(context);
      context.services.set(service.id, service);
    }
  }



  let _defaultChangesetComment = context.initialHashParams.comment;
  let _defaultChangesetSource = context.initialHashParams.source;
  let _defaultChangesetHashtags = context.initialHashParams.hashtags;
  context.defaultChangesetComment = function(val) {
    if (!arguments.length) return _defaultChangesetComment;
    _defaultChangesetComment = val;
    return context;
  };
  context.defaultChangesetSource = function(val) {
    if (!arguments.length) return _defaultChangesetSource;
    _defaultChangesetSource = val;
    return context;
  };
  context.defaultChangesetHashtags = function(val) {
    if (!arguments.length) return _defaultChangesetHashtags;
    _defaultChangesetHashtags = val;
    return context;
  };


  /* User interface and keybinding */
  // AFAICT `lastPointerType` is just used to localize the intro? for now - instead get this from pixi?
  // context.lastPointerType = () => _uiSystem.lastPointerType();
  context.lastPointerType = () => 'mouse';

  let _keybinding = utilKeybinding('context');
  context.keybinding = () => _keybinding;
  d3_select(document).call(_keybinding);


  /* Connection */
  let _preauth;
  context.preauth = (options) => {
    _preauth = Object.assign({}, options);  // copy and remember for init time
    return context;
  };

  /* connection options for source switcher (optional) */
  let _apiConnections;
  context.apiConnections = function(val) {
    if (!arguments.length) return _apiConnections;
    _apiConnections = val;
    return context;
  };

  // A String or Array of locale codes to prefer over the browser's settings
  let _prelocale;
  context.locale = function(locale) {
    _prelocale = locale;  // copy and remember for init time
    return context;
  };


  function afterLoad(cid, callback) {
    return (err, result) => {
      const osm = context.services.get('osm');
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
        _editSystem.merge(result.data, result.seenIDs);
        if (typeof callback === 'function') {
          callback(err, result);
        }
        return;
      }
    };
  }


  context.loadTiles = (projection, callback) => {
    const MINZOOM = 15;
    const TILESIZE = 256;

    const osm = context.services.get('osm');
    if (!osm) return;

    const z = geoScaleToZoom(projection.scale(), TILESIZE);
    if (z < MINZOOM) return;  // this would fire off too many API requests

    if (context.editable()) {
      const cid = osm.connectionID;
      osm.loadTiles(projection, afterLoad(cid, callback));
    }
  };


  context.loadTileAtLoc = (loc, callback) => {
    const osm = context.services.get('osm');
    if (!osm) return;

    if (context.editable()) {
      const cid = osm.connectionID;
      osm.loadTileAtLoc(loc, afterLoad(cid, callback));
    }
  };


  // Download the full entity and its parent relations. The callback may be called multiple times.
  context.loadEntity = (entityID, callback) => {
    const osm = context.services.get('osm');
    if (!osm) return;

    const cid = osm.connectionID;
    osm.loadEntity(entityID, afterLoad(cid, callback));
    osm.loadEntityRelations(entityID, afterLoad(cid, callback));
  };


  context.zoomToEntity = (entityID, zoomTo) => {
    const entity = context.hasEntity(entityID);

    if (entity) {   // have it already
      context.enter(modeSelect(context, [entityID]));
      if (zoomTo !== false) {
        _mapSystem.zoomTo(entity);
      }

    } else {   // need to load it first
      context.loadEntity(entityID, (err, result) => {
        if (err) return;
        const loadedEntity = result.data.find(e => e.id === entityID);
        if (!loadedEntity) return;

        context.enter(modeSelect(context, [entityID]));
        if (zoomTo !== false) {
          _mapSystem.zoomTo(loadedEntity);
        }
      });
    }
  };


  // String length limits in Unicode characters, not JavaScript UTF-16 code units
  context.maxCharsForTagKey = () => 255;
  context.maxCharsForTagValue = () => 255;
  context.maxCharsForRelationRole = () => 255;

  function cleanOsmString(val, maxChars) {
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
  context.cleanTagKey = (val) => cleanOsmString(val, context.maxCharsForTagKey());
  context.cleanTagValue = (val) => cleanOsmString(val, context.maxCharsForTagValue());
  context.cleanRelationRole = (val) => cleanOsmString(val, context.maxCharsForRelationRole());


  /* Intro */
  let _inIntro = false;
  context.inIntro = function(val) {
    if (!arguments.length) return _inIntro;

    _inIntro = val;

    if (_urlHashSystem) {
      if (val) {
        _urlHashSystem.disable();
      } else {
        _urlHashSystem.enable();
      }
    }
    return context;
  };


  // Immediately save the user's history to localstorage, if possible
  // This is called sometimes, but also on the `window.onbeforeunload` handler
  context.save = () => {
    // no history save, no message onbeforeunload
    if (_inIntro || context.container().select('.modal').size()) return;

    let canSave;
    if (context._currMode?.id === 'save') {
      canSave = false;

      // Attempt to prevent user from creating duplicate changes - see iD#5200
      const osm = context.services.get('osm');
      if (osm && osm.isChangesetInflight()) {
        _editSystem.clearSaved();
        return;
      }

    } else {
      canSave = context.selectedIDs().every(id => {
        const entity = context.hasEntity(id);
        return entity && !entity.isDegenerate();
      });
    }

    if (canSave) {
      _editSystem.save();
    }
    if (_editSystem.hasChanges()) {
      return _localizationSystem.t('save.unsaved_changes');
    }
  };

  // Debounce save, since it's a synchronous localStorage write,
  // and history changes can happen frequently (e.g. when dragging).
  context.debouncedSave = _debounce(context.save, 350);

  function withDebouncedSave(fn) {
    return function() {
      const result = fn.apply(_editSystem, arguments);
      context.debouncedSave();
      return result;
    };
  }


  // The current mode (`null` until ui.render initializes the map and enters browse mode)
  context._currMode = null;
  context.mode = () => context._currMode;

  /**
   * `enter`
   * Enters the given mode, with an optional bunch of features selected.
   * If the mode could not be entered for whatever reason, falls back to entering browse mode.
   *
   * @param   `modeOrModeID`  `Object` or `String` identifying the mode to enter
   * @param   `options`        Optional `Object` of options passed to the new mode
   * @return  The mode that got entered
   */
  context.enter = (modeOrModeID, options) => {
    const currMode = context._currMode;
    let newMode;

    if (typeof modeOrModeID === 'string') {
      newMode = context.modes.get(modeOrModeID);
    } else {
      newMode = modeOrModeID;
    }
    if (!newMode) {
      console.error(`context.enter: no such mode: ${modeOrModeID}`);  // eslint-disable-line no-console
      newMode = context.modes.get('browse');  // fallback
    }

    // Exit current mode, if any
    if (currMode) {
      currMode.exit();
      _container.classed(`mode-${currMode.id}`, false);
      dispatch.call('exit', this, currMode);
    }

    // Try to enter the new mode, fallback to 'browse' mode
    context._currMode = newMode;
    const didEnter = context._currMode.enter(options);
    if (!didEnter) {
      context._currMode = context.modes.get('browse');
      context._currMode.enter();
    }
    _container.classed(`mode-${context._currMode.id}`, true);
    dispatch.call('enter', this, context._currMode);
    return context._currMode;
  };

  /**
   * `selectedData`
   * Returns a Map containing the current selected features.  It can contain
   * multiple items of various types (e.g. some OSM data, some Rapid data etc)
   *
   * @return  The current selected features, as a `Map(datumID -> datum)`
   */
  context.selectedData = () => {
    if (!context._currMode) return new Map();
    return context._currMode.selectedData || new Map();
  };

  /**
   * `selectedIDs`
   * @return  Just the keys of the `selectedData`
   */
  context.selectedIDs = () => {
    if (!context._currMode) return [];
    if (typeof context._currMode.selectedIDs === 'function') {
      return context._currMode.selectedIDs();         // class function
    } else {
      return context._currMode.selectedIDs || [];     // class property
    }
  };


// ...and definitely stop doing this...
//  let _selectedNoteID;
//  context.selectedNoteID = function(noteID) {
//    if (!arguments.length) return _selectedNoteID;
//    _selectedNoteID = noteID;
//    return context;
//  };
//  let _selectedErrorID;
//  context.selectedErrorID = function(errorID) {
//    if (!arguments.length) return _selectedErrorID;
//    _selectedErrorID = errorID;
//    return context;
//  };
  context.selectedNoteID = () => {
    console.error('deprecated: do not call context.selectedNoteID anymore');   // eslint-disable-line no-console
    return null;
  };
  context.selectedErrorID = () => {
    console.error('deprecated: do not call context.selectedErrorID anymore');   // eslint-disable-line no-console
    return null;
  };


  /**
   * `enableBehaviors`
   * The given behaviorIDs will be enabled, all others will be disabled
   * @param   `enableIDs`  `Array` or `Set` containing behaviorIDs to keep enabled
   */
  context.enableBehaviors = function(enableIDs) {
    if (!(enableIDs instanceof Set)) {
      enableIDs = new Set([].concat(enableIDs));  // coax ids into a Set
    }

    context.behaviors.forEach((behavior, behaviorID) => {
      if (enableIDs.has(behaviorID)) {  // should be enabled
        if (!behavior.enabled) {
          behavior.enable();
        }
      } else {  // should be disabled
        if (behavior.enabled) {
          behavior.disable();
        }
      }
    });
  };

  context.install = () => {
    console.error('deprecated: do not call context.install anymore');   // eslint-disable-line no-console
  };
  context.uninstall = () => {
    console.error('deprecated: do not call context.uninstall anymore');   // eslint-disable-line no-console
  };
//old redo on every mode change
//  context.install = (behavior) => {
//    if (typeof behavior.enable === 'function') {
//      behavior.enable();
//    }
//  };
//  context.uninstall = (behavior) => {
//    if (typeof behavior.disable === 'function') {
//      behavior.disable();
//    }
//  };
//  // context.install = (behavior) =>  { return; };
//  // context.uninstall = (behavior) => { return; };
//  // context.install = (behavior) => context.surface().call(behavior);
//  // context.uninstall = (behavior) => context.surface().call(behavior.off);


  /* Copy/Paste */
  let _copyGraph;
  context.copyGraph = () => _copyGraph;

  let _copyIDs = [];
  context.copyIDs = function(val) {
    if (!arguments.length) return _copyIDs;
    _copyIDs = val;
    _copyGraph = _editSystem.graph();
    return context;
  };

  let _copyLoc;
  context.copyLoc = function(val) {
    if (!arguments.length) return _copyLoc;
    _copyLoc = val;
    return context;
  };



  /* Debug */
  let _debugFlags = {
    tile: false,        // tile boundaries
    label: false,       // label placement
    imagery: false,     // imagery bounding polygons
    target: false,      // touch targets
    downloaded: false   // downloaded data from osm
  };
  context.debugFlags = () => _debugFlags;
  context.getDebug = (flag) => flag && _debugFlags[flag];
  context.setDebug = function(flag, val = true) {
    _debugFlags[flag] = val;
    if (_mapSystem?.renderer) {
      _mapSystem.immediateRedraw();
    }
    return context;
  };


  /* Container */
  let _container = d3_select(null);
  context.container = function(val) {
    if (!arguments.length) return _container;
    _container = val;
    _container.classed('ideditor', true);
    return context;
  };
  context.containerNode = function(val) {
    if (!arguments.length) return context.container().node();
    context.container(d3_select(val));
    return context;
  };

  let _embed;
  context.embed = function(val) {
    if (!arguments.length) return _embed;
    _embed = val;
    return context;
  };


  /* Assets */
  let _assetPath = '';
  context.assetPath = function(val) {
    if (!arguments.length) return _assetPath;
    _assetPath = val;
    return context;
  };

  let _assetMap = {};
  context.assetMap = function(val) {
    if (!arguments.length) return _assetMap;
    _assetMap = val;
    return context;
  };

  context.asset = (val) => {
    if (/^http(s)?:\/\//i.test(val)) return val;
    const filename = _assetPath + val;
    return _assetMap[filename] || filename;
  };

  context.imagePath = (val) => {
    console.error('deprecated: do not call context.imagePath anymore');   // eslint-disable-line no-console
    return context.asset(`img/${val}`);
  };


  /* Projection */
  context.projection = new Projection();


  /* Init */
  context.init = () => {
    initializeAll();
    return context;


    // Initialize core systems
    // Call .init() functions to start setting everything up.
    // At this step all core object are instantiated and they may access context.
    // They may start listening to events, but they should not call each other.
    // The order of .init() may matter here if dependents make calls to each other.
    // The UI is the final thing that gets initialized.
    function initializeAll() {
      _storageSystem.init();
      _dataLoaderSystem.init();

      if (context.initialHashParams.presets) {
        const presetIDs = context.initialHashParams.presets.split(',').map(s => s.trim()).filter(Boolean);
        _presetSystem.addablePresetIDs = new Set(presetIDs);
      }
      let overrideLocale =  context.initialHashParams.locale ?? _prelocale;
      if (overrideLocale) {
        _localizationSystem.preferredLocaleCodes = overrideLocale;
      }

      // kick off some async work
      _localizationSystem.initAsync();
      _presetSystem.initAsync();

      for (const service of context.services.values()) {
        service.init();
      }

      // Setup the connection if we have preauth credentials to use
      const osm = context.services.get('osm');
      if (osm && _preauth) {
        osm.switch(_preauth);
      }

      _uiSystem.init();
      _editSystem.init();
      _filterSystem.init();
      _imagerySystem.init();
      _locationSystem.init();
      _mapSystem.init();       // watch out - init doesn't actually create the renderer :(
      _rapidSystem.init();
      _uploaderSystem.init();
      _validationSystem.init();

      // If the container isn't available, e.g. when testing, don't load the UI
      if (!context.container().empty()) {
        _uiSystem.ensureLoaded()
          .then(() => {
            _map3dSystem.init();
            _photoSystem.init();
            _urlHashSystem.init();  // tries to adjust map transform
          });
      }
    }
  };


  /* Reset (aka flush) */
  context.reset = context.flush = () => {
    context.debouncedSave.cancel();

    for (const service of context.services.values()) {
      service.reset();
    }

    _editSystem.reset();
    _filterSystem.reset();
    _rapidSystem.reset();
    _uploaderSystem.reset();
    _validationSystem.reset();

    // don't leave stale state in the inspector
    context.container().select('.inspector-wrap *').remove();
  };


  return context;
}
