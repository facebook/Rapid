import { select as d3_select } from 'd3-selection';
import { Projection, Extent, geoMetersToLon, geoScaleToZoom, geoZoomToScale, vecAdd, vecScale, vecSubtract } from '@rapid-sdk/math';

import { AbstractSystem } from './AbstractSystem';
import { PixiRenderer } from '../pixi/PixiRenderer';
import { uiCmd } from '../ui/cmd.js';
import { utilTotalExtent } from '../util/util';
import { utilGetDimensions } from '../util/dimensions';


const TILESIZE = 256;
const MINZOOM = 2;
const MAXZOOM = 24;
const MINK = geoZoomToScale(MINZOOM, TILESIZE);
const MAXK = geoZoomToScale(MAXZOOM, TILESIZE);

function clamp(num, min, max) {
  return Math.max(min, Math.min(num, max));
}


/**
 * `MapSystem` maintains the map state and provides an interface for manipulating the map view.
 *
 * Supports `pause()` / `resume()` - when paused, the map system will not render
 *
 * Properties available:
 *   `dimensions`      The pixel dimensions of the map viewport [width,height]
 *   `supersurface`    D3 selection to the parent `div` "supersurface"
 *   `surface`         D3 selection to the sibling `canvas` "surface"
 *   `overlay`         D3 selection to the sibling `div` "overlay"
 *   `highlightEdits`   true` if edited features should be shown in a special style, `false` otherwise
 *   `areaFillMode`    one of 'full', 'partial' (default), or 'wireframe'
 *   `wireframeMode`   `true` if fill mode is 'wireframe', `false` otherwise
 *
 * Events available:
 *   `draw`       Fires after a full redraw
 *   `move`       Fires after the map's transform has changed (can fire frequently)
 *                 ('move' is mostly for when you want to update some content that floats over the map)
 *   `mapchange`  Fires on any change in map display options (wireframe/areafill, highlightedits)
 */
export class MapSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'map';
    this.dependencies = new Set(['editor', 'filters', 'imagery', 'photos', 'storage', 'l10n', 'urlhash']);

    this.supersurface = d3_select(null);  // parent `div` temporary zoom/pan transform
    this.surface = d3_select(null);       // sibling `canvas`
    this.overlay = d3_select(null);       // sibling `div`, offsets supersurface transform (used to hold the editmenu)

    // display options
    this.areaFillOptions = ['wireframe', 'partial', 'full'];
    this._highlightEdits = false;      // whether to style edited features differently
    this._currFillMode = 'partial';    // the current fill mode
    this._toggleFillMode = 'partial';  // the previous *non-wireframe* fill mode

    this._renderer = null;
    this._dimensions = [1, 1];
    this._initPromise = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this._hashchange = this._hashchange.bind(this);
    this._updateHash = this._updateHash.bind(this);
    this.render = this.render.bind(this);
    this.immediateRedraw = this.immediateRedraw.bind(this);
    this.deferredRedraw = this.deferredRedraw.bind(this);
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
    const storage = context.systems.storage;
    const l10n = context.systems.l10n;

    // Note: We want MapSystem's hashchange listener registered as early as possible
    // because so many other parts of Rapid rely on the map location being set correctly.
    // Other systems should register their hashchange listener after MapSystem.initAsync.
    context.systems.urlhash.on('hashchange', this._hashchange);

    const prerequisites = Promise.all([
      storage.initAsync(),
      l10n.initAsync()
    ]);

    return this._initPromise = prerequisites
      .then(() => {
        this._currFillMode = storage.getItem('area-fill') || 'partial';           // the current fill mode
        this._toggleFillMode = storage.getItem('area-fill-toggle') || 'partial';  // the previous *non-wireframe* fill mode

        const wireframeKey = l10n.t('area_fill.wireframe.key');
        const highlightEditsKey = l10n.t('map_data.highlight_edits.key');

        context.keybinding()
          .on(wireframeKey, e => {
            e.preventDefault();
            e.stopPropagation();
            this.wireframeMode = !this.wireframeMode;
          })
          .on(uiCmd('⌥' + wireframeKey), e => {
            e.preventDefault();
            e.stopPropagation();

            // Don't allow layer changes while drawing - iD#6584
            const mode = context.mode;
            if (mode && /^draw/.test(mode.id)) return;

            this.scene.toggleLayers('osm');
            context.enter('browse');
          })
          .on(highlightEditsKey, e => {
            e.preventDefault();
            this.highlightEdits = !this.highlightEdits;
          });
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
   * render
   * @param  `selection`  A d3-selection to a `div` that the map should render itself into
   */
  render(selection) {
    const context = this.context;

    // Selection here contains a D3 selection for the `main-map` div that the map gets added to
    // It's an absolutely positioned div that takes up as much space as it's allowed to.
    selection
      // Suppress the native right-click context menu
      .on('contextmenu', e => e.preventDefault())
      // Suppress swipe-to-navigate browser pages on trackpad/magic mouse – iD#5552
      .on('wheel.map mousewheel.map', e => e.preventDefault());

    // The `supersurface` is a wrapper div that we temporarily transform as the user zooms and pans.
    // This allows us to defer actual rendering until the browser has more time to do it.
    // At regular intervals we reset this root transform and actually redraw the this.
    this.supersurface = selection
      .append('div')
      .attr('class', 'supersurface');

    // Content beneath the supersurface may be transformed and will need to rerender sometimes.
    // This includes the Pixi WebGL canvas and the right-click edit menu

    // Historically `surface` was the root of the SVG DOM - Now it's the Pixi WebGL canvas.
    // Things that will not work anymore:
    //  - d3 selecting surface's child stuff
    //  - css classing surface's child stuff
    //  - listening to events on the surface
    this.surface = this.supersurface
      .append('canvas')
      .attr('class', 'surface');

    // The `overlay` is a div that is transformed to cancel out the supersurface.
    // This is a place to put things _not drawn by pixi_ that should stay positioned
    // with the map, like the editmenu.
    this.overlay = this.supersurface
      .append('div')
      .attr('class', 'overlay');

    if (!this._renderer) {
      this._renderer = new PixiRenderer(context, this.supersurface, this.surface, this.overlay);

      // Forward the 'move' and 'draw' events from PixiRenderer
      this._renderer
        .on('move', () => this.emit('move'))
        .on('draw', () => {
          this._updateHash();
          this.emit('draw', { full: true });  // pass {full: true} for legacy receivers
        });
    }

    this.dimensions = utilGetDimensions(selection);


    // Setup events that cause the map to redraw...
    const editor = context.systems.editor;
    const filters = context.systems.filters;
    const imagery = context.systems.imagery;
    const photos = context.systems.photos;
    const scene = this._renderer.scene;

    editor
      .on('merge', entityIDs => {
        if (entityIDs) {
          scene.dirtyData('osm', entityIDs);
        }
        this.deferredRedraw();
      })
      .on('stagingchange', difference => {
        // todo - maybe only do this if difference.didChange.geometry?
        const complete = difference.complete();
        for (const entity of complete.values()) {
          if (entity) {      // may be undefined if entity was deleted
            entity.touch();  // bump .v in place, rendering code will pick it up as dirty
            filters.clearEntity(entity);  // clear feature filter cache
          }
        }
        this.immediateRedraw();
      })
      .on('historyjump', (prevIndex, currIndex) => {
        // This code occurs when jumping to a different edit because of a undo/redo/restore, etc.
        // Counterintuitively, when undoing, we want the metadata from the _next_ edit (located at prevIndex).
        const didUndo = (currIndex === prevIndex - 1);
        const edit = didUndo ? editor.history[prevIndex] : editor.history[currIndex];

        // Reposition the map if we've jumped to a different place.
        const t0 = this.transform();
        const t1 = edit.transform;
        if (t1 && (t0.x !== t1.x || t0.y !== t1.y || t0.k !== t1.k)) {
          this.transformEase(t1);
        }

        // Switch to select mode if the edit contains selected ids.
        // Note: draw modes need to do a little extra work to survive this,
        //  so they have their own `historyjump` listeners.
        const modeID = context.mode?.id;
        if (/^draw/.test(modeID)) return;

        // For now these IDs are assumed to be OSM ids.
        // Check that they are actually in the stable graph.
        const graph = edit.graph;
        const checkIDs = edit.selectedIDs ?? [];
        const selectedIDs = checkIDs.filter(entityID => graph.hasEntity(entityID));
        if (selectedIDs.length) {
          context.enter('select-osm', { selection: { osm: selectedIDs }} );
        } else {
          context.enter('browse');
        }
      });

    filters
      .on('filterchange', () => {
        scene.dirtyLayers('osm');
        this.immediateRedraw();
      });

    imagery.on('imagerychange', this.immediateRedraw);
    photos.on('photochange', this.immediateRedraw);
    scene.on('layerchange', this.immediateRedraw);

    const osm = context.services.osm;
    if (osm) {
      osm.on('authchange', this.immediateRedraw);
    }
  }


  /**
   * _hashchange
   * Respond to any changes appearing in the url hash
   * @param  currParams   Map(key -> value) of the current hash parameters
   * @param  prevParams   Map(key -> value) of the previous hash parameters
   */
  _hashchange(currParams, prevParams) {
    // map
    const newMap = currParams.get('map');
    const oldMap = prevParams.get('map');
    if (!newMap || newMap !== oldMap) {
      let zoom, lat, lon, rot;
      if (typeof newMap === 'string') {
        [zoom, lat, lon, rot] = newMap.split('/', 4).map(Number);
      }
      if (isNaN(zoom) || !isFinite(zoom)) zoom = 2;
      if (isNaN(lat) || !isFinite(lat)) lat = 0;
      if (isNaN(lon) || !isFinite(lon)) lon = 0;
      if (isNaN(rot) || !isFinite(rot)) rot = 0;

      zoom = clamp(zoom, 2, 24);
      lat = clamp(lat, -90, 90);
      lon = clamp(lon, -180, 180);
      rot = clamp(rot, 0, 360);

      this.centerZoom([lon, lat], zoom);
    }

    // id
    const newIds = currParams.get('id');
    const oldIds = prevParams.get('id');
    if (newIds !== oldIds) {
      if (typeof newIds === 'string') {
        const ids = newIds.split(',').map(s => s.trim()).filter(Boolean);
        const modeID = this.mode?.id;
        if (ids.length && modeID !== 'save') {
          this.selectEntityID(ids[0]);  // for now, just the select first one
        }
      }
    }
  }


  /**
   * _updateHash
   * Push changes in map state to the urlhash
   */
  _updateHash() {
    const [lon, lat] = this.center();
    const zoom = this.zoom();
    const rot = 0;  // for now
    const precision = Math.max(0, Math.ceil(Math.log(zoom) / Math.LN2));
    const EPSILON = 0.1;

    if (isNaN(zoom) || !isFinite(zoom)) return;
    if (isNaN(lat) || !isFinite(lat)) return;
    if (isNaN(lon) || !isFinite(lon)) return;
    if (isNaN(rot) || !isFinite(rot)) return;

    const zoomStr = zoom.toFixed(2);
    const latStr = lat.toFixed(precision);
    const lonStr = lon.toFixed(precision);
    const rotStr = rot.toFixed(1);

    let v = `${zoomStr}/${latStr}/${lonStr}`;
    if (Math.abs(rot) > EPSILON) {
      v += `/${rotStr}`;
    }
    this.context.systems.urlhash.setParam('map', v);
  }


  /**
   * deferredRedraw
   * Tell the renderer to redraw soon
   * This is ideal for most situations where data is streaming in, and we can
   * allow the changes to batch up over several animation frames.
   */
  deferredRedraw() {
    if (!this._renderer || this._paused) return;
    this._renderer.deferredRender();
  }


  /**
   * immediateRedraw
   * Tell the renderer to redraw as soon as possible.
   * This is ideal for interactive situations where the user did a thing and we want
   * the map to update on one of the next few animation frames to show their change.
   */
  immediateRedraw() {
    if (!this._renderer || this._paused) return;
    this._renderer.render();
  }


  /**
   * dimensions
   * Set/Get the map viewport dimensions in pixels
   * @param  val?  Array [width, height] to set the dimensions to
   */
  get dimensions() {
    return this._dimensions;
  }
  set dimensions(val) {
    const [w, h] = val;
    this._dimensions = val;
    this.context.projection.dimensions([[0, 0], [w, h]]);
    this._renderer.resize(w, h);
  }


  /**
   * centerPoint
   * Returns the [x,y] pixel at the center of the viewport
   * @return  Array [x,y] pixel at the center of the viewport
   */
  centerPoint() {
    return vecScale(this._dimensions, 0.5);
  }


  /**
   * centerLoc
   * Returns the current [lon,lat] location at the center of the viewport
   * @return  Array [lon,lat] location at the center of the viewport
   */
  centerLoc() {
    return this.context.projection.invert(this.centerPoint());
  }


  /**
   * mouse
   * Gets the current [x,y] pixel location of the pointer
   * (or center of map if there is no readily available pointer coordinate)
   * @return  Array [x,y] pixel location of pointer (or center of the map)
   */
  mouse() {
    return this._renderer.events.coord || this.centerPoint();
  }


  /**
   * mouseLoc
   * Gets the current [lon,lat] location of the pointer
   * (or center of map if there is no readily available pointer coordinate)
   * @return  Array [lon,lat] location of pointer (or center of the map)
   */
  mouseLoc() {
    return this.context.projection.invert(this.mouse());
  }


  /**
   * transform
   * Set/Get the map transform
   * IF setting, will schedule an update of map transform/projection.
   * All convenience methods for adjusting the map go through here.
   *   (the old way did a round trip through the d3-zoom event system)
   * @param  t2         Transform Object with `x`,`y`,`k` properties.
   * @param  duration?  Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return map transform -or- this
   */
  transform(t2, duration) {
    if (t2 === undefined) {
      return this.context.projection.transform();
    }
    if (duration === undefined) {
      duration = 0;
    }
    this._renderer.setTransformAsync(t2, duration);
    return this;
  }


  /**
   * setTransformAsync
   * Newer Promise-returning version of `transform()`
   * @param   t2         Transform Object with `x`,`y`,`k` properties.
   * @param   duration?  Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return  Promise that resolves when the transform has finished changing
   */
  setTransformAsync(t2, duration = 0) {
    return this._renderer.setTransformAsync(t2, duration);
  }


  /**
   * centerZoom
   * Set both center and zoom at the same time
   * @param  loc2       Array [lon,lat] to set the center to
   * @param  z2         Number to set the zoom to
   * @param  duration?  Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return this
   */
  centerZoom(loc2, z2, duration = 0) {
    const c = this.center();
    const z = this.zoom();
    if (loc2[0] === c[0] && loc2[1] === c[1] && z2 === z) {  // nothing to do
      return this;
    }

    const k2 = clamp(geoZoomToScale(z2, TILESIZE), MINK, MAXK);
    let proj = new Projection();
    proj.transform(this.context.projection.transform()); // make copy
    proj.scale(k2);

    let t = proj.translate();
    const point = proj.project(loc2);
    const center = this.centerPoint();
    const delta = vecSubtract(center, point);
    t = vecAdd(t, delta);

    return this.transform({ x: t[0], y: t[1], k: k2 }, duration);
  }


  /**
   * setCenterZoomAsync
   * Newer Promise-returning version of `centerZoom()`
   * @param   loc2       Array [lon,lat] to set the center to
   * @param   z2         Number to set the zoom to
   * @param   duration?  Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return  Promise that resolves when the transform has finished changing
   */
  setCenterZoomAsync(loc2, z2, duration = 0) {
    const c = this.center();
    const z = this.zoom();
    if (loc2[0] === c[0] && loc2[1] === c[1] && z2 === z) {  // nothing to do
      return new Promise.resolve(this.context.projection.transform());
    }

    const k2 = clamp(geoZoomToScale(z2, TILESIZE), MINK, MAXK);
    let proj = new Projection();
    proj.transform(this.context.projection.transform()); // make copy
    proj.scale(k2);

    let t = proj.translate();
    const point = proj.project(loc2);
    const center = this.centerPoint();
    const delta = vecSubtract(center, point);
    t = vecAdd(t, delta);

    return this.setTransformAsync({ x: t[0], y: t[1], k: k2 }, duration);
  }


  /**
   * center
   * Set/Get the map center
   * @param  loc2?      Array [lon,lat] to set the center to
   * @param  duration?  Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return map center -or- this
   */
  center(loc2, duration) {
    if (loc2 === undefined) {
      return this.context.projection.invert(this.centerPoint());
    }
    if (duration === undefined) {
      duration = 0;
    }
    loc2[0] = clamp(loc2[0] || 0, -180, 180);
    loc2[1] = clamp(loc2[1] || 0, -90, 90);
    return this.centerZoom(loc2, this.zoom(), duration);
  }


  /**
   * zoom
   * Set/Get the map zoom
   * @param  z2?        Number to set the zoom to
   * @param  duration?  Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return map zoom -or- this
   */
  zoom(z2, duration) {
    if (z2 === undefined) {
      return Math.max(0, geoScaleToZoom(this.context.projection.scale(), TILESIZE));
    }
    if (duration === undefined) {
      duration = 0;
    }
    z2 = clamp(z2 || 0, MINZOOM, MAXZOOM);
    return this.centerZoom(this.center(), z2, duration);
  }


  /**
   * pan
   * Pan the map by given pixel amount
   * @param  delta      Array [dx,dy] amount to pan the map
   * @param  duration?  Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return this
   */
  pan(delta, duration = 0) {
    const t = this.context.projection.transform();
    return this.transform({ x: t.x + delta[0], y: t.y + delta[1], k: t.k }, duration);
  }


  /**
   * fitEntities
   * Adjust the map to fit to see the given entity or entities
   * @param  entities   Entity or Array of entities to fit in the map view
   * @param  duration?  Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return this
   */
  fitEntities(entities, duration = 0) {
    let extent;

    const editor = this.context.systems.editor;
    const graph = editor.staging.graph;

    if (Array.isArray(entities)) {
      extent = utilTotalExtent(entities, graph);
    } else {
      extent = entities.extent(graph);
    }
    if (!isFinite(extent.area())) return this;

    const z2 = clamp(this.trimmedExtentZoom(extent), 0, 20);
    return this.centerZoom(extent.center(), z2, duration);
  }


  /**
   * selectEntityID
   * Selects an entity by ID, loading it first if needed
   * @param  entityID     entityID to select
   * @param  fitToEntity  Whether to force fit the map view to show the entity
   */
  selectEntityID(entityID, fitToEntity = false) {
    const context = this.context;
    const editor = context.systems.editor;

    const gotEntity = (entity) => {
      const selectedIDs = context.selectedIDs();
      if (context.mode?.id !== 'select-osm' || !selectedIDs.includes(entityID)) {
        context.enter('select-osm', { selection: { osm: [entity.id] }} );
      }

      const currGraph = editor.staging.graph;  // may have changed by the time we get in here
      const entityExtent = entity.extent(currGraph);
      const entityZoom = Math.min(this.trimmedExtentZoom(entityExtent), 20);  // the zoom that best shows the entity
      const isOffscreen = (entityExtent.percentContainedIn(this.extent()) < 0.8);
      const isTooSmall = (this.zoom() < entityZoom - 2);

      // Can't reasonably see it, or we're forcing the fit.
      if (fitToEntity || isOffscreen || isTooSmall) {
        this.fitEntities(entity);
      }
    };

    const currGraph = editor.staging.graph;
    let entity = currGraph.hasEntity(entityID);
    if (entity) {   // have it already
      gotEntity(entity);

    } else {   // need to load it first
      context.loadEntity(entityID, (err, result) => {
        if (err) return;
        entity = result.data.find(e => e.id === entityID);
        if (!entity) return;
        gotEntity(entity);
      });
    }
  }


  // convenience methods for zomming in and out
  _zoomIn(delta)  { return this.centerZoom(this.center(), ~~this.zoom() + delta, 250); }
  _zoomOut(delta) { return this.centerZoom(this.center(), ~~this.zoom() - delta, 250); }

  zoomIn()        { return this._zoomIn(1); }
  zoomInFurther() { return this._zoomIn(4); }
  canZoomIn()     { return this.zoom() < MAXZOOM; }

  zoomOut()        { return this._zoomOut(1); }
  zoomOutFurther() { return this._zoomOut(4); }
  canZoomOut()     { return this.zoom() > MINZOOM; }

  // convenience methods for the above, but with easing
  transformEase(t2, duration = 250)          { return this.transform(t2, duration); }
  centerZoomEase(loc2, z2, duration = 250)   { return this.centerZoom(loc2, z2, duration); }
  centerEase(loc2, duration = 250)           { return this.center(loc2, duration); }
  zoomEase(z2, duration = 250)               { return this.zoom(z2, duration); }
  fitEntitiesEase(entities, duration = 250)  { return this.fitEntities(entities, duration); }


  /**
   * effectiveZoom
   * The "effective" zoom can be more useful for controlling the experience of the user.
   * This zoom is adjusted by latitude.
   * You can think of it as "what the zoom would be if we were editing at the equator"
   * For example, if we are editing in Murmansk, Russia, at about 69° North latitude,
   *  a true zoom of 14.6 corresponds to an effective zoom of 16.
   * Put another way, even at z14.6 the user should be allowed to edit the map,
   *  and it should be styled as if it were z16.
   *
   * @return  effective zoom
   */
  effectiveZoom() {
    const lat = this.center()[1];
    const z = this.zoom();
    const atLatitude = geoMetersToLon(1, lat);
    const atEquator = geoMetersToLon(1, 0);
    const extraZoom = Math.log(atLatitude / atEquator) / Math.LN2;
    return Math.min(z + extraZoom, MAXZOOM);
  }


  /**
   * extent
   * Set/Get the map extent
   * @param  extent?    Extent Object to fit the map to
   * @return map extent -or- this
   */
  extent(extent) {
    if (extent === undefined) {
      return new Extent(
        this.context.projection.invert([0, this._dimensions[1]]),
        this.context.projection.invert([this._dimensions[0], 0])
      );
    } else {
      return this.centerZoom(extent.center(), this.extentZoom(extent));
    }
  }


  /**
   * trimmedExtent
   * Set/Get the map extent, but include some padding for header, footer, etc.
   * @param  extent?    Extent Object to fit the map to
   * @return map extent -or- this
   */
  trimmedExtent(extent) {
    if (extent === undefined) {
      const headerY = 71;
      const footerY = 30;
      const pad = 10;
      return new Extent(
        this.context.projection.invert([pad, this._dimensions[1] - footerY - pad]),
        this.context.projection.invert([this._dimensions[0] - pad, headerY + pad])
      );
    } else {
      return this.centerZoom(extent.center(), this.trimmedExtentZoom(extent));
    }
  }


  /**
   * extentZoom
   * Returns the maximum zoom that will fit the given extent in the map viewport.
   * @param  extent        Extent Object to fit
   * @param  dimensions?   Array [width, height] to fit it in (defaults to viewport)
   * @return zoom
   */
  extentZoom(extent, dimensions) {
    const [w, h] = dimensions || this._dimensions;

    const tl = this.context.projection.project([extent.min[0], extent.max[1]]);
    const br = this.context.projection.project([extent.max[0], extent.min[1]]);

    // Calculate maximum zoom that fits extent
    const hFactor = (br[0] - tl[0]) / w;
    const vFactor = (br[1] - tl[1]) / h;
    const hZoomDiff = Math.log(Math.abs(hFactor)) / Math.LN2;
    const vZoomDiff = Math.log(Math.abs(vFactor)) / Math.LN2;
    const zoomDiff = Math.max(hZoomDiff, vZoomDiff);

    const currZoom = this.zoom();
    const defaultZoom = Math.max(currZoom, 19);

    return isFinite(zoomDiff) ? (currZoom - zoomDiff) : defaultZoom;
  }


  /**
   * trimmedExtentZoom
   * Returns the maximum zoom that will fit the given extent in the map viewport,
   *   but zoomed out slightly to account for header, footer, etc.
   * @param  extent    Extent Object to fit
   * @return zoom
   */
  trimmedExtentZoom(extent) {
    const trimW = 40;
    const trimH = 140;
    const trimmed = vecSubtract(this._dimensions, [trimW, trimH]);
    return this.extentZoom(extent, trimmed);
  }


  /**
   * highlightEdits
   * set/get whether to show edited features in a special style
   */
  get highlightEdits() {
    return this._highlightEdits;
  }
  set highlightEdits(val) {
    if (this._highlightEdits === val) return;  // no change

    this._highlightEdits = val;
    this._renderer.scene.dirtyScene();
    this.immediateRedraw();
    this.emit('mapchange');
  }


  /**
   * areaFillMode
   * set/get the area fill mode - one of 'full', 'partial' (default), or 'wireframe'
   */
  get areaFillMode() {
    return this._currFillMode;
  }
  set areaFillMode(val) {
    const prefs = this.context.systems.storage;
    const current = this._currFillMode;
    if (current === val) return;  // no change

    if (current !== 'wireframe') {
      this._toggleFillMode = current;
      prefs.setItem('area-fill-toggle', current);  // remember the previous *non-wireframe* fill mode
    }

    this._currFillMode = val;
    prefs.setItem('area-fill', val);

    this._renderer.scene.dirtyScene();
    this.immediateRedraw();
    this.emit('mapchange');
  }


  /**
   * wireframeMode
   * set/get whether the area fill mode is set to 'wireframe'
   */
  get wireframeMode() {
    return this._currFillMode === 'wireframe';
  }
  set wireframeMode(val) {
    if (val) {
      if (this.areaFillMode !== 'wireframe') {
        this.areaFillMode = 'wireframe';
      }
    } else {
      this.areaFillMode = this._toggleFillMode;  // go back to the previous *non-wireframe* fill mode
    }
  }


  /**
   * scene
   * @return reference to the PixiScene object
   * @readonly
   */
  get scene() {
    return this._renderer.scene;
  }

  /**
   * scene
   * @return reference to the PixiRenderer object
   * @readonly
   */
  get renderer() {
    return this._renderer;
  }

}
