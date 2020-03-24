import _debounce from 'lodash-es/debounce';

import { dispatch as d3_dispatch } from 'd3-dispatch';
import { json as d3_json } from 'd3-fetch';
import { select as d3_select } from 'd3-selection';

import { t, currentLocale, addTranslation, setLocale } from '../util/locale';

import { coreRapidContext } from './rapid_context';
import { coreData } from './data'; 
import { coreHistory } from './history';
import { coreValidator } from './validator';
import { dataLocales, dataEn } from '../../data';
import { geoRawMercator } from '../geo/raw_mercator';
import { modeSelect } from '../modes/select';
import { osmSetAreaKeys, osmSetPointTags, osmSetVertexTags } from '../osm/tags';
import { presetIndex } from '../presets';
import { rendererBackground, rendererFeatures, rendererMap, rendererPhotos } from '../renderer';
import { services } from '../services';
import { uiInit } from '../ui/init';
import { utilDetect } from '../util/detect';
import { utilKeybinding, utilRebind, utilStringQs } from '../util';


export function coreContext() {
    const dispatch = d3_dispatch('enter', 'exit', 'change');
    let context = utilRebind({}, dispatch, 'on');
    let _deferred = new Set();

    context.version = '2.17.1';
    context.privacyVersion = '20191217';

    // create a special translation that contains the keys in place of the strings
    let tkeys = JSON.parse(JSON.stringify(dataEn));  // clone deep
    let parents = [];

    function traverser(v, k, obj) {
        parents.push(k);
        if (typeof v === 'object') {
            forOwn(v, traverser);
        } else if (typeof v === 'string') {
            obj[k] = parents.join('.');
        }
        parents.pop();
    }

    function forOwn(obj, fn) {
        Object.keys(obj).forEach(function (k) { fn(obj[k], k, obj); });
    }

    forOwn(tkeys, traverser);
    addTranslation('_tkeys_', tkeys);

    addTranslation('en', dataEn);
    setLocale('en');


    // https://github.com/openstreetmap/iD/issues/772
    // http://mathiasbynens.be/notes/localstorage-pattern#comment-9
    let _storage;
    try { _storage = localStorage; } catch (e) { }  // eslint-disable-line no-empty
    _storage = _storage || (function () {
        let s = {};
        return {
            getItem: (k) => s[k],
            setItem: (k, v) => s[k] = v,
            removeItem: (k) => delete s[k]
        };
    })();

    context.storage = function (k, v) {
        try {
            if (arguments.length === 1) return _storage.getItem(k);
            else if (v === null) _storage.removeItem(k);
            else _storage.setItem(k, v);
        } catch (e) {
            // localstorage quota exceeded
            /* eslint-disable no-console */
            if (typeof console !== 'undefined') console.error('localStorage quota exceeded');
            /* eslint-enable no-console */
        }
    };


    /* User interface and keybinding */
    let _ui;
    context.ui = () => _ui;

    let keybinding = utilKeybinding('context');
    context.keybinding = function () { return keybinding; };
    d3_select(document).call(keybinding);


    /* Straight accessors. Avoid using these if you can. */
    let _connection;
    let _data;
    let _history; 
    let _validator;
    context.connection = () =>  _connection;
    context.history = () => _history;
    context.validator = () =>  _validator;
    context.data = () =>  _data;
    
    /* Connection */
    context.preauth = (options) => {
        if (_connection) {
            _connection.switch(options);
        }
        return context;
    };


    function afterLoad(callback) {
        return (err, result) => {
            if (!err && result && result.data) {
                _history.merge(result.data, result.extent);
            }
            if (callback) {
                callback(err, result);
            }
        };
    }


    context.loadTiles = (projection, callback) => {
        const handle = window.requestIdleCallback( () => {
            _deferred.delete(handle);
            if (_connection && context.editableDataEnabled()) {
                _connection.loadTiles(projection, afterLoad(callback));
            }
        });
        _deferred.add(handle);
    };

    context.loadTileAtLoc = (loc, callback) => {
        const handle = window.requestIdleCallback( () => {
            _deferred.delete(handle);
            if (_connection && context.editableDataEnabled()) {
                _connection.loadTileAtLoc(loc, afterLoad(callback));
            }
        });
        _deferred.add(handle);
    };

    context.loadEntity = (entityID, callback) => {
        if (_connection) {
            _connection.loadEntity(entityID, afterLoad(callback));
        }
    };

    context.zoomToEntity = (entityID, zoomTo) => {
        if (zoomTo !== false) {
            context.loadEntity(entityID, (err, result) => {
                if (err) return;
                const entity = result.data.find(e => e.id === entityID);
                if (entity) {
                    _map.zoomTo(entity);
                }
            });
        }

        _map.on('drawn.zoomToEntity', () => {
            if (!context.hasEntity(entityID)) return;
            _map.on('drawn.zoomToEntity', null);
            context.on('enter.zoomToEntity', null);
            context.enter(modeSelect(context, [entityID]));
        });

        context.on('enter.zoomToEntity', () => {
            if (_mode.id !== 'browse') {
                _map.on('drawn.zoomToEntity', null);
                context.on('enter.zoomToEntity', null);
            }
        });
    };


    let _minEditableZoom = 16;
    context.minEditableZoom = function (val) {
        if (!arguments.length) return _minEditableZoom;
        _minEditableZoom = val;
        if (_connection) {
            _connection.tileZoom(val);
        }
        return context;
    };


    context.maxCharsForTagKey = () => {
        return 255;
    };

    context.maxCharsForTagValue = () => {
        return 255;
    };

    context.maxCharsForRelationRole = () => {
        return 255;
    };
    
    /* History */
    let _inIntro = false;
    context.inIntro = function (val) {
        if (!arguments.length) return _inIntro;
        _inIntro = val;
        return context;
    };

    context.save = () => {
        // no history save, no message onbeforeunload
        if (_inIntro || d3_select('.modal').size()) return;

        let canSave;
        if (_mode && _mode.id === 'save') {
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


    /* Graph */
    context.hasEntity = (id) => { return _history.graph().hasEntity(id); };
    context.entity = (id) => { return _history.graph().entity(id); };
    context.childNodes = (way)=>  { return _history.graph().childNodes(way); };
    context.geometry = (id) => { return context.entity(id).geometry(_history.graph()); };


    /* Modes */
    let _mode;
    context.mode = () => {
        return _mode;
    };
    context.enter = (newMode) => {
        if (_mode) {
            _mode.exit();
            _container.classed('mode-' + _mode.id, false);
            dispatch.call('exit', this, _mode);
        }

        _mode = newMode;
        _mode.enter();
        _container.classed('mode-' + newMode.id, true);
        dispatch.call('enter', this, _mode);
    };

    context.selectedIDs = () => {
        if (_mode && _mode.selectedIDs) {
            return _mode.selectedIDs();
        } else {
            return [];
        }
    };

    context.activeID = () => {
        return _mode && _mode.activeID && _mode.activeID();
    };


    /* Behaviors */
    context.install = (behavior) => {
        context.surface().call(behavior);
    };
    context.uninstall = (behavior) => {
        context.surface().call(behavior.off);
    };


    /* Copy/Paste */
    let copyGraph;
    context.copyGraph = () => { return copyGraph; };
    
    let _copyIDs = [];
    context.copyIDs = function (val) {
        if (!arguments.length) return _copyIDs;
        _copyIDs = val;
        copyGraph = _history.graph();
        return context;
    };


    /* Background */
    let _background;
    context.background = () => { return _background; };


    /* Features */
    let _features;
    context.features = () => { return _features; };
    context.hasHiddenConnections = (id) => {
        const graph = _history.graph();
        const entity = graph.entity(id);
        return _features.hasHiddenConnections(entity, graph);
    };


    /* Photos */
    let _photos;
    context.photos = () => { return _photos; };


    /* Presets */
    let _presets;
    context.presets = () => { return _presets; };


    /* Map */
    let _map;
    context.map = () => { return _map; };
    context.layers = () => { return _map.layers; };
    context.surface = () => { return _map.surface; };
    context.editableDataEnabled = () => { return _map.editableDataEnabled(); };
    context.editable = () => {

        // don't allow editing during save
        const mode = context.mode();
        if (!mode || mode.id === 'save') return false;

        return _map.editableDataEnabled();
    };
    context.surfaceRect = () => {
        return _map.surface.node().getBoundingClientRect();
    };


    /* Debug */
    let _debugFlags = {
        tile: false,        // tile boundaries
        collision: false,   // label collision bounding boxes
        imagery: false,     // imagery bounding polygons
        target: false,      // touch targets
        downloaded: false   // downloaded data from osm
    };
    context.debugFlags = () => _debugFlags;
    context.getDebug = (flag) => flag && _debugFlags[flag];
    context.setDebug = function (flag, val) {
        if (arguments.length === 1) val = true;
        _debugFlags[flag] = val;
        dispatch.call('change');
        return context;
    };


    /* Container */
    let _container = d3_select(document.body);
    context.container = function (val) {
        if (!arguments.length) return _container;
        _container = val;
        _container.classed('id-container', true);
        return context;
    };
    let _embed;
    context.embed = function (val) {
        if (!arguments.length) return _embed;
        _embed = val;
        return context;
    };


    /* Assets */
    let _assetPath = '';
    context.assetPath = function (val) {
        if (!arguments.length) return _assetPath;
        _assetPath = val;
        return context;
    };

    let _assetMap = {};
    context.assetMap = function (val) {
        if (!arguments.length) return _assetMap;
        _assetMap = val;
        return context;
    };

    context.asset = (val) => {
        const filename = _assetPath + val;
        return _assetMap[filename] || filename;
    };

    context.imagePath = (val) => {
        return context.asset('img/' + val);
    };

    context.asset = (val) => {
        if (/^http(s)?:\/\//i.test(val)) return val;
        const filename = _assetPath + val;
        return _assetMap[filename] || filename;
    };

    /* locales */
    // `locale` variable contains a "requested locale".
    // It won't become the `currentLocale` until after loadLocale() is called.
    let _locale, _localePath;

    context.locale = function (loc, path) {
        if (!arguments.length) return currentLocale;
        _locale = loc;
        _localePath = path;
        return context;
    };

    context.loadLocale = (callback) => {
        if (_locale && _locale !== 'en' && dataLocales.hasOwnProperty(_locale)) {
            _localePath = _localePath || context.asset('locales/' + _locale + '.json');
            d3_json(_localePath)
                .then((result) => {
                    addTranslation(_locale, result[_locale]);
                    setLocale(_locale);
                    utilDetect(true);
                    if (callback) callback();
                })
                .catch((err) => {
                    if (callback) callback(err.message);
                });
        } else {
            if (_locale) {
                setLocale(_locale);
                utilDetect(true);
            }
            if (callback) {
                callback();
            }
        }
    };


    /* reset (aka flush) */
    context.reset = context.flush = () => {
        context.debouncedSave.cancel();

        Array.from(_deferred).forEach((handle) =>{
            window.cancelIdleCallback(handle);
            _deferred.delete(handle);
        });

        Object.values(services).forEach((service) => {
            if (service && typeof service.reset === 'function') {
                service.reset(context);
            }
        });

        _validator.reset();
        _features.reset();
        _history.reset();

        return context;
    };

    /* Init */
    context.init = () => {
        context.projection = geoRawMercator();
        context.curtainProjection = geoRawMercator();

        _locale = utilDetect().locale;
        if (_locale && !dataLocales.hasOwnProperty(_locale)) {
            _locale = _locale.split('-')[0];
        }

        _data = coreData(context);
        _history = coreHistory(context);
        _validator = coreValidator(context);

        context.graph = _history.graph;
        context.changes = _history.changes;
        context.intersects = _history.intersects;
        context.pauseChangeDispatch = _history.pauseChangeDispatch;
        context.resumeChangeDispatch = _history.resumeChangeDispatch;

        // Debounce save, since it's a synchronous localStorage write,
        // and history changes can happen frequently (e.g. when dragging).
        context.debouncedSave = _debounce(context.save, 350);
        function withDebouncedSave(fn) {
            return function () {
                const result = fn.apply(_history, arguments);
                context.debouncedSave();
                return result;
            };
        }

        context.perform = withDebouncedSave(_history.perform);
        context.replace = withDebouncedSave(_history.replace);
        context.pop = withDebouncedSave(_history.pop);
        context.overwrite = withDebouncedSave(_history.overwrite);
        context.undo = withDebouncedSave(_history.undo);
        context.redo = withDebouncedSave(_history.redo);

        _ui = uiInit(context);

        _connection = services.osm;
        _background = rendererBackground(context);
        _features = rendererFeatures(context);
        _photos = rendererPhotos(context);
        _presets = presetIndex(context);

        const hash = utilStringQs(window.location.hash);
        
        if (services.maprules && hash.maprules) {
            d3_json(hash.maprules)
                .then(mapcss => {
                    services.maprules.init();
                    mapcss.forEach(mapcssSelector => services.maprules.addRule(mapcssSelector));
                })
                .catch(function () {/* ignore */ });
        }

        _map = rendererMap(context);
        context.mouse = _map.mouse;
        context.extent = _map.extent;
        context.pan = _map.pan;
        context.zoomIn = _map.zoomIn;
        context.zoomOut = _map.zoomOut;
        context.zoomInFurther = _map.zoomInFurther;
        context.zoomOutFurther = _map.zoomOutFurther;
        context.redrawEnable = _map.redrawEnable;

        Object.values(services).forEach(service => {
            if (service && typeof service.init === 'function') {
                service.init(context);
            }
        });

        _validator.init();
        _background.init();
        _features.init();
        _photos.init();

        let presetsParameter = hash.presets;
        if (presetsParameter && presetsParameter.indexOf('://') !== -1) {
            // assume URL of external presets file

            _presets.fromExternal(external, function (externalPresets) {
                context.presets = () => { return externalPresets; }; // default + external presets...
                osmSetAreaKeys(_presets.areaKeys());
                osmSetPointTags(_presets.pointTags());
                osmSetVertexTags(_presets.vertexTags());
            });
        } else {
            let addablePresetIDs;
            if (presetsParameter) {
                // assume list of allowed preset IDs
                addablePresetIDs = presetsParameter.split(',');
            }
            _presets.init(addablePresetIDs);
            osmSetAreaKeys(_presets.areaKeys());
            osmSetPointTags(_presets.pointTags());
            osmSetVertexTags(_presets.vertexTags());
        }

        const rapidContext = coreRapidContext(context);
        context.rapidContext = () => { return rapidContext; };
        context.isFirstSession = !context.storage('sawSplash');

        return context;
    };
    
    return context;
}
