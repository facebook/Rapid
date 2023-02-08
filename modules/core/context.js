import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { Projection, geoScaleToZoom } from '@id-sdk/math';
import { utilStringQs, utilUnicodeCharsTruncated } from '@id-sdk/util';
import _debounce from 'lodash-es/debounce';

import { t } from '../core/localizer';
import { coreRapidContext } from './rapid_context';
import { fileFetcher } from './file_fetcher';
import { localizer } from './localizer';
import { prefs } from './preferences';
import { coreHistory } from './history';
import { coreValidator } from './validator';
import { coreUploader } from './uploader';
import { UrlHash } from './UrlHash';

import { BehaviorDrag } from '../behaviors/BehaviorDrag';
import { BehaviorDraw } from '../behaviors/BehaviorDraw';
import { BehaviorHover } from '../behaviors/BehaviorHover';
import { BehaviorLasso } from '../behaviors/BehaviorLasso';
import { BehaviorMapInteraction } from '../behaviors/BehaviorMapInteraction';
import { BehaviorMapNudging } from '../behaviors/BehaviorMapNudging';
import { BehaviorPaste } from '../behaviors/BehaviorPaste';
import { BehaviorSelect } from '../behaviors/BehaviorSelect';

import { ModeAddNote } from '../modes/ModeAddNote';
import { ModeAddPoint } from '../modes/ModeAddPoint';
import { ModeBrowse } from '../modes/ModeBrowse';
import { ModeDragNode } from '../modes/ModeDragNode';
import { ModeDrawArea } from '../modes/ModeDrawArea';
import { ModeDrawLine } from '../modes/ModeDrawLine';
import { ModeMove } from '../modes/ModeMove';
import { ModeRotate } from '../modes/ModeRotate';
import { ModeSave } from '../modes/ModeSave';
import { ModeSelect } from '../modes/ModeSelect';  // new
import { modeSelect } from '../modes/select';      // legacy

import { presetManager } from '../presets';
import { rendererFeatures, RendererImagery, RendererMap, RendererPhotos } from '../renderer';
import { services } from '../services';
import { uiInit } from '../ui/init';
import { utilKeybinding, utilRebind } from '../util';



export function coreContext() {
  const dispatch = d3_dispatch('enter', 'exit');
  let context = utilRebind({}, dispatch, 'on');
  let _deferred = new Set();

  context.version = '2.0.0-beta.0';
  context.privacyVersion = '20201202';

  // iD will alter the hash so cache the parameters intended to setup the session
  context.initialHashParams = window.location.hash ? utilStringQs(window.location.hash) : {};

  context.isFirstSession = !prefs('sawSplash') && !prefs('sawPrivacyVersion');

  /* Changeset */
  // An osmChangeset object. Not loaded until needed.
  context.changeset = null;

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
  let _ui;
  context.ui = () => _ui;
  // AFAICT `lastPointerType` is just used to localize the intro? for now - instead get this from pixi?
  // context.lastPointerType = () => _ui.lastPointerType();
  context.lastPointerType = () => 'mouse';

  let _keybinding = utilKeybinding('context');
  context.keybinding = () => _keybinding;
  d3_select(document).call(_keybinding);


  // Instantiate the connection here because it doesn't require passing in
  // `context` and it's needed for pre-init calls like `preauth`
  let _connection = services.osm;
  let _history;
  let _uploader;
  let _urlhash;
  let _validator;
  context.connection = () => _connection;
  context.history = () => _history;
  context.uploader = () => _uploader;
  context.urlhash = () => _urlhash;
  context.validator = () => _validator;

  /* Connection */
  context.preauth = (options) => {
    if (_connection) {
      _connection.switch(options);
    }
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
  context.locale = function(locale) {
    if (!arguments.length) return localizer.localeCode();
    localizer.preferredLocaleCodes(locale);
    return context;
  };


  function afterLoad(cid, callback) {
    return (err, result) => {
      if (err) {
        // 400 Bad Request, 401 Unauthorized, 403 Forbidden..
        if (err.status === 400 || err.status === 401 || err.status === 403) {
          if (_connection) {
            _connection.logout();
          }
        }
        if (typeof callback === 'function') {
          callback(err);
        }
        return;

      } else if (_connection && _connection.getConnectionId() !== cid) {
        if (typeof callback === 'function') {
          callback({ message: 'Connection Switched', status: -1 });
        }
        return;

      } else {
        _history.merge(result.data, result.seenIDs);
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

    const z = geoScaleToZoom(projection.scale(), TILESIZE);
    if (z < MINZOOM) return;  // this would fire off too many API requests

    const handle = window.requestIdleCallback(() => {
      _deferred.delete(handle);

      // `projection` may have changed in the time it took to requestIdleCallback!
      // Double-check that user hasn't zoomed out more in that time.
      const z = geoScaleToZoom(projection.scale(), TILESIZE);
      if (z < MINZOOM) return;  // this would fire off too many API requests

      if (_connection && context.editable()) {
        const cid = _connection.getConnectionId();
        _connection.loadTiles(projection, afterLoad(cid, callback));
      }
    });
    _deferred.add(handle);
  };

  context.loadTileAtLoc = (loc, callback) => {
    const handle = window.requestIdleCallback(() => {
      _deferred.delete(handle);
      if (_connection && context.editable()) {
        const cid = _connection.getConnectionId();
        _connection.loadTileAtLoc(loc, afterLoad(cid, callback));
      }
    });
    _deferred.add(handle);
  };

  // Download the full entity and its parent relations. The callback may be called multiple times.
  context.loadEntity = (entityID, callback) => {
    if (_connection) {
      const cid = _connection.getConnectionId();
      _connection.loadEntity(entityID, afterLoad(cid, callback));
      // We need to fetch the parent relations separately.
      _connection.loadEntityRelations(entityID, afterLoad(cid, callback));
    }
  };

  context.zoomToEntity = (entityID, zoomTo) => {
    let entity = context.hasEntity(entityID);

    if (entity) {   // have it already
      context.enter(modeSelect(context, [entityID]));
      if (zoomTo !== false) {
        _map.zoomTo(entity);
      }

    } else {   // need to load it first
      context.loadEntity(entityID, (err, result) => {
        if (err) return;
        const entity = result.data.find(e => e.id === entityID);
        if (!entity) return;

        context.enter(modeSelect(context, [entityID]));
        if (zoomTo !== false) {
          _map.zoomTo(entity);
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


  /* History */
  let _inIntro = false;
  context.inIntro = function(val) {
    if (!arguments.length) return _inIntro;

    _inIntro = val;

    if (_urlhash) {
      if (val) {
        _urlhash.enable();
      } else {
        _urlhash.disable();
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
    if (context._currMode && context._currMode.id === 'save') {
      canSave = false;

      // Attempt to prevent user from creating duplicate changes - see #5200
      if (services.osm && services.osm.isChangesetInflight()) {
        _history.clearSaved();
        return;
      }

    } else {
      canSave = context.selectedIDs().every(id => {
        const entity = context.hasEntity(id);
        return entity && !entity.isDegenerate();
      });
    }

    if (canSave) {
      _history.save();
    }
    if (_history.hasChanges()) {
      return t('save.unsaved_changes');
    }
  };

  // Debounce save, since it's a synchronous localStorage write,
  // and history changes can happen frequently (e.g. when dragging).
  context.debouncedSave = _debounce(context.save, 350);

  function withDebouncedSave(fn) {
    return function() {
      const result = fn.apply(_history, arguments);
      context.debouncedSave();
      return result;
    };
  }


  /* Modes */
  // "Modes" are editing tasks that the user are allowed to perform.
  // Each mode is exclusive, i.e only one mode can be active at a time.
  context.modes = new Map();  // Map (mode.id -> mode)

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
   * multiple items of various types (e.g. some OSM data, some RapiD data etc)
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

  /**
   * `activeData`
   * Returns a Map containing the current "active" features.
   * These are features currently being interacted with, e.g. dragged or drawing
   * These are features that should not generate interaction events
   *
   * @return  The current active features, as a `Map(datumID -> datum)`
   */
  context.activeData = () => {
    if (!context._currMode) return new Map();
    return context._currMode.activeData || new Map();
  };

  /**
   * `activeIDs`
   * @return  Just the keys of the `activeData`
   */
  context.activeIDs = () => {
    if (!context._currMode) return [];
    if (typeof context._currMode.activeIDs === 'function') {
      return context._currMode.activeIDs();         // class function
    } else {
      return context._currMode.activeIDs || [];     // class property
    }
  };

  context.activeID = () => {
    console.error('error: do not call context.activeID anymore');   // eslint-disable-line no-console
    return null;
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
    console.error('error: do not call context.selectedNoteID anymore');   // eslint-disable-line no-console
    return null;
  };
  context.selectedErrorID = () => {
    console.error('error: do not call context.selectedErrorID anymore');   // eslint-disable-line no-console
    return null;
  };


  /* Behaviors */
  // "Behaviors" are bundles of event handlers that we can
  // enable and disable depending on what the user is doing.
  context.behaviors = new Map();  // Map (behavior.id -> behavior)

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
    console.error('error: do not call context.install anymore');   // eslint-disable-line no-console
  };
  context.uninstall = () => {
    console.error('error: do not call context.uninstall anymore');   // eslint-disable-line no-console
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
    _copyGraph = _history.graph();
    return context;
  };

  let _copyLoc;
  context.copyLoc = function(val) {
    if (!arguments.length) return _copyLoc;
    _copyLoc = val;
    return context;
  };


  /* Imagery */
  let _imagery;
  context.imagery = () => _imagery;
  context.background = () => _imagery;   // legacy name


  /* Features */
  let _features;
  context.features = () => _features;
  context.hasHiddenConnections = (id) => {
    const graph = _history.graph();
    const entity = graph.entity(id);
    return _features.hasHiddenConnections(entity, graph);
  };


  /* Photos */
  let _photos;
  context.photos = () => _photos;


  /* Map */
  let _map;
  context.map = () => _map;
  context.scene = () => _map.scene;
  context.surface = () => _map.surface;
  context.surfaceRect = () => _map.surface.node().getBoundingClientRect();
  context.editable = () => {
    const mode = context.mode();
    if (!mode || mode.id === 'save') return false;   // don't allow editing during save
    return true;  // _map.editableDataEnabled();     // todo: disallow editing if OSM layer is off
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
    if (_map) {
      _map.immediateRedraw();
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
    fileFetcher.assetPath(val);
    return context;
  };

  let _assetMap = {};
  context.assetMap = function(val) {
    if (!arguments.length) return _assetMap;
    _assetMap = val;
    fileFetcher.assetMap(val);
    return context;
  };

  context.asset = (val) => {
    if (/^http(s)?:\/\//i.test(val)) return val;
    const filename = _assetPath + val;
    return _assetMap[filename] || filename;
  };

  context.imagePath = (val) => context.asset(`img/${val}`);


  /* reset (aka flush) */
  context.reset = context.flush = () => {
    context.debouncedSave.cancel();

    Array.from(_deferred).forEach(handle => {
      window.cancelIdleCallback(handle);
      _deferred.delete(handle);
    });

    Object.values(services).forEach(service => {
      if (service && typeof service.reset === 'function') {
        service.reset(context);
      }
    });

    context.changeset = null;

    _rapidContext.reset();
    _validator.reset();
    _features.reset();
    _history.reset();
    _uploader.reset();

    // don't leave stale state in the inspector
    context.container().select('.inspector-wrap *').remove();

    return context;
  };


  /* Projection */
  context.projection = new Projection();

  /* Rapid */
  let _rapidContext;
  context.rapidContext = () => _rapidContext;

  /* Init */
  context.init = () => {
    instantiateInternal();
    initializeDependents();
    return context;


    // Load variables and properties. No property of `context` should be accessed
    // until this is complete since load statuses are indeterminate. The order
    // of instantiation shouldn't matter.
    function instantiateInternal() {
      _history = coreHistory(context);
      context.graph = _history.graph;
      context.hasEntity = (id) => _history.graph().hasEntity(id);
      context.entity = (id) => _history.graph().entity(id);
      context.pauseChangeDispatch = _history.pauseChangeDispatch;
      context.resumeChangeDispatch = _history.resumeChangeDispatch;
      context.perform = withDebouncedSave(_history.perform);
      context.replace = withDebouncedSave(_history.replace);
      context.pop = withDebouncedSave(_history.pop);
      context.overwrite = withDebouncedSave(_history.overwrite);
      context.undo = withDebouncedSave(_history.undo);
      context.redo = withDebouncedSave(_history.redo);

      // Instantiate core classes
      _validator = coreValidator(context);
      _uploader = coreUploader(context);
      _imagery = new RendererImagery(context);
      _features = rendererFeatures(context);
      _map = new RendererMap(context);
      _photos = new RendererPhotos(context);
      _rapidContext = coreRapidContext(context);
      _urlhash = new UrlHash(context);
      _ui = uiInit(context);

      // Instantiate Behaviors
      [
        new BehaviorDrag(context),
        new BehaviorDraw(context),
        new BehaviorHover(context),
        new BehaviorLasso(context),
        new BehaviorMapInteraction(context),
        new BehaviorMapNudging(context),
        new BehaviorPaste(context),
        new BehaviorSelect(context)
      ].forEach(behavior => context.behaviors.set(behavior.id, behavior));

      // Instantiate Modes
      [
        new ModeAddNote(context),
        new ModeAddPoint(context),
        new ModeBrowse(context),
        new ModeDragNode(context),
        new ModeDrawArea(context),
        new ModeDrawLine(context),
        new ModeMove(context),
        new ModeRotate(context),
        new ModeSave(context),
        new ModeSelect(context)
      ].forEach(mode => context.modes.set(mode.id, mode));
    }

    // Set up objects that might need to access properties of `context`. The order
    // might matter if dependents make calls to each other. Be wary of async calls.
    function initializeDependents() {
      if (context.initialHashParams.presets) {
        presetManager.addablePresetIDs(new Set(context.initialHashParams.presets.split(',')));
      }
      if (context.initialHashParams.locale) {
        localizer.preferredLocaleCodes(context.initialHashParams.locale);
      }

      // kick off some async work
      localizer.ensureLoaded();
      presetManager.ensureLoaded();

      // Run initializers - this is where code should be that establishes event listeners
      Object.values(services).forEach(service => {
        if (service && typeof service.init === 'function') {
          service.init();
        }
      });

      _validator.init();
      _imagery.init();
      _features.init();
      _map.init();
      _rapidContext.init();

      // If the container isn't available, e.g. when testing, don't load the UI
      if (!context.container().empty()) {
        _ui.ensureLoaded()
          .then(() => {
            _photos.init();
          });
      }
    }
  };

  return context;
}
