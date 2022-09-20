import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { Projection, Extent, geoMetersToLon, geoScaleToZoom, geoZoomToScale, vecAdd, vecScale, vecSubtract } from '@id-sdk/math';

import { PixiRenderer } from '../pixi/PixiRenderer';

import { prefs } from '../core/preferences';
import { utilTotalExtent } from '../util/util';
import { utilGetDimensions } from '../util/dimensions';
import { utilRebind } from '../util/rebind';


const TILESIZE = 256;
const MINZOOM = 2;
const MAXZOOM = 24;
const MINK = geoZoomToScale(MINZOOM, TILESIZE);
const MAXK = geoZoomToScale(MAXZOOM, TILESIZE);

function clamp(num, min, max) {
  return Math.max(min, Math.min(num, max));
}


export function rendererMap(context) {
  const dispatch = d3_dispatch('move', 'drawn', 'changeHighlighting', 'changeAreaFill');

  let supersurface = d3_select(null);  // parent `div` temporary zoom/pan transform
  let surface = d3_select(null);       // sibling `canvas`
  let overlay = d3_select(null);       // sibling `div`, offsets supersurface transform (used to hold the editmenu)

  let _renderer;
  let _dimensions = [1, 1];

  let _wireFrameMode = false;
  let _redrawEnabled = true;


  /**
   *  map
   */
  function map(selection) {

    // Selection here contains a D3 selection for the `main-map` div that the map gets added to
    // It's an absolutely positioned div that takes up as much space as it's allowed to.
    selection
      // Suppress the native right-click context menu
      .on('contextmenu', e => e.preventDefault())
      // Suppress swipe-to-navigate browser pages on trackpad/magic mouse – #5552
      .on('wheel.map mousewheel.map', e => e.preventDefault());

    // The `supersurface` is a wrapper div that we temporarily transform as the user zooms and pans.
    // This allows us to defer actual rendering until the browser has more time to do it.
    // At regular intervals we reset this root transform and actually redraw the map.
    map.supersurface = supersurface = selection
      .append('div')
      .attr('class', 'supersurface');

    // Content beneath the supersurface may be transformed and will need to rerender sometimes.
    // This includes the Pixi WebGL canvas and the right-click edit menu

    // Historically `surface` was the root of the SVG DOM - Now it's the Pixi WebGL canvas.
    // Things that will not work anymore:
    //  - d3 selecting surface's child stuff
    //  - css classing surface's child stuff
    //  - listening to events on the surface
    map.surface = surface = supersurface
      .append('canvas')
      .attr('class', 'surface');

    // The `overlay` is a div that is transformed to cancel out the supersurface.
    // This is a place to put things _not drawn by pixi_ that should stay positioned
    // with the map, like the editmenu.
    map.overlay = overlay = supersurface
      .append('div')
      .attr('class', 'overlay');

    _renderer = new PixiRenderer(context, supersurface, surface, overlay);

    map.dimensions(utilGetDimensions(selection));

    context.background().initDragAndDrop();


    // Setup events that cause the map to redraw...
    // context.features()
    //   .on('redraw.map', map.immediateRedraw);

    const osm = context.connection();
    if (osm) {
      osm.on('change', map.immediateRedraw);
    }

    function didUndoOrRedo(targetTransform) {
      const mode = context.mode().id;
      if (mode !== 'browse' && mode !== 'select') return;
      if (targetTransform) {
        map.transformEase(targetTransform);
      }
    }

    context.history()
      .on('merge', entityIDs => {
        if (entityIDs) {
          _renderer.scene.dirtyFeatures(entityIDs);
        }
        map.deferredRedraw();
      })
      .on('change', difference => {
        if (difference) {
          _renderer.scene.dirtyFeatures(Object.keys(difference.complete()));
        }
        map.immediateRedraw();
      })
      .on('undone', (stack, fromStack) => didUndoOrRedo(fromStack.transform))
      .on('redone', (stack) => didUndoOrRedo(stack.transform));

    context.background()
      .on('change', map.immediateRedraw);

    _renderer.scene
      .on('layerchange', () => {
        context.background().updateImagery();
        map.immediateRedraw();
    });

    context.behaviors.get('map-interaction')
      .on('transformchanged', map.transform);
  }


  map.init = () => { /* noop */ };

  /**
   * dimensions
   * Set/Get the map dimensions
   * @param  val?       Array [x,y] to set the dimensions to
   * @return map dimensions -or- this
   */
  map.dimensions = function(val) {
    if (!arguments.length) return _dimensions;

    _dimensions = val;
    context.projection.dimensions([[0, 0], _dimensions]);
    _renderer.resize(_dimensions[0], _dimensions[1]);
    return map;
  };

  function _centerPixel() {
    return vecScale(_dimensions, 0.5);
  }


  // Deferred redraw
  map.deferredRedraw = () => {
    if (!_redrawEnabled) return;
    _renderer.deferredRender();
  };

  // Immediate redraw
  map.immediateRedraw = () => {
    if (!_redrawEnabled) return;
    _renderer.render();
    dispatch.call('drawn', this, { full: true });
  };


  /**
   * mouse
   * Gets the current [x,y] location of the pointer
   * @return  Array [x,y] (or `null` if the map is not interactive)
   */
  map.mouse = () => {
    const behavior = context.behaviors.get('map-interaction');
    return behavior && behavior.coord;
  };

  /**
   * mouseCoordinates
   * Gets the current [lon,lat] location of the pointer
   * @return  Array [lon,lat] (or location at the center of the map)
   */
  map.mouseCoordinates = () => {
    const coord = map.mouse() || _centerPixel();
    return context.projection.invert(coord);
  };


  /**
   * transform
   * Set/Get the map transform
   * IF setting, will schedule an update of map transform/projection.
   * All convenience methods for adjusting the map go through here.
   *   (the old way did a round trip through the d3-zoom event system)
   * @param  t          Transform Object with `x`,`y`,`k` properties.
   * @param  duration?  Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return map transform -or- this
   */
  map.transform = function(t2, duration) {
    if (!arguments.length) {
      return context.projection.transform();
    }
    if (duration === undefined) {
      duration = 0;
    }
    _renderer.setTransform(t2, duration);
    return map;
  };

  /**
   * centerZoom
   * Set both center and zoom at the same time
   * @param  loc2       Array [lon,lat] to set the center to
   * @param  z2         Number to set the zoom to
   * @param  duration?  Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return this
   */
  map.centerZoom = (loc2, z2, duration = 0) => {
    const c = map.center();
    const z = map.zoom();
    if (loc2[0] === c[0] && loc2[1] === c[1] && z2 === z) {  // nothing to do
      return map;
    }

    const k2 = clamp(geoZoomToScale(z2, TILESIZE), MINK, MAXK);
    let proj = new Projection();
    proj.transform(context.projection.transform()); // make copy
    proj.scale(k2);

    let t = proj.translate();
    const point = proj.project(loc2);
    const center = _centerPixel();
    const delta = vecSubtract(center, point);
    t = vecAdd(t, delta);

    return map.transform({ x: t[0], y: t[1], k: k2 }, duration);
  };

  /**
   * center
   * Set/Get the map center
   * @param  loc2?      Array [lon,lat] to set the center to
   * @param  duration?  Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return map center -or- this
   */
  map.center = function(loc2, duration) {
    if (!arguments.length) {
      return context.projection.invert(_centerPixel());
    }
    if (duration === undefined) {
      duration = 0;
    }
    loc2[0] = clamp(loc2[0] || 0, -180, 180);
    loc2[1] = clamp(loc2[1] || 0, -90, 90);
    return map.centerZoom(loc2, map.zoom(), duration);
  };

  /**
   * zoom
   * Set/Get the map zoom
   * @param  z2?        Number to set the zoom to
   * @param  duration?  Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return map zoom -or- this
   */
  map.zoom = function(z2, duration) {
    if (!arguments.length) {
      return Math.max(0, geoScaleToZoom(context.projection.scale(), TILESIZE));
    }
    if (duration === undefined) {
      duration = 0;
    }
    z2 = clamp(z2 || 0, MINZOOM, MAXZOOM);
    return map.centerZoom(map.center(), z2, duration);
  };

  /**
   * pan
   * Pan the map by given pixel amount
   * @param  delta      Array [dx,dy] amount to pan the map
   * @param  duration?  Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return this
   */
  map.pan = (delta, duration = 0) => {
    const t = context.projection.transform();
    return map.transform({ x: t.x + delta[0], y: t.y + delta[1], k: t.k }, duration);
  };

  /**
   * zoomTo
   * Adjust the map to fit to see the given entity or entities  (should be called `fitTo`)
   * @param  val        Entity or Array of entities to fit in the map view
   * @param  duration?  Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return this
   */
  map.zoomTo = (val, duration = 0) => {
    let extent;
    if (Array.isArray(val)) {
      extent = utilTotalExtent(val, context.graph());
    } else {
      extent = val.extent(context.graph());
    }
    if (!isFinite(extent.area())) return map;

    const z2 = clamp(map.trimmedExtentZoom(extent), 0, 20);
    return map.centerZoom(extent.center(), z2, duration);
  };


  // convenience methods for zomming in and out
  function _zoomIn(delta) {
    map.centerZoom(map.center(), ~~map.zoom() + delta, 250);
  }
  function _zoomOut(delta) {
    map.centerZoom(map.center(), ~~map.zoom() - delta, 250);
  }

  map.zoomIn = () => _zoomIn(1);
  map.zoomInFurther = () => _zoomIn(4);
  map.canZoomIn = () => map.zoom() < MAXZOOM;

  map.zoomOut = () => _zoomOut(1);
  map.zoomOutFurther = () => _zoomOut(4);
  map.canZoomOut = () => map.zoom() > MINZOOM;

  // convenience methods for the above, but with easing
  map.transformEase = (t2, duration = 250) => map.transform(t2, duration);
  map.centerZoomEase = (loc2, z2, duration = 250) => map.centerZoom(loc2, z2, duration);
  map.centerEase = (loc2, duration = 250) => map.center(loc2, duration);
  map.zoomEase = (z2, duration = 250) => map.zoom(z2, duration);
  map.zoomToEase = (val, duration = 250) => map.zoomTo(val, duration);


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
  map.effectiveZoom = () => {
    const lat = map.center()[1];
    const z = map.zoom();
    const atLatitude = geoMetersToLon(1, lat);
    const atEquator = geoMetersToLon(1, 0);
    const extraZoom = Math.log(atLatitude / atEquator) / Math.LN2;
    return Math.min(z + extraZoom, MAXZOOM);
  };

  /**
   * extent
   * Set/Get the map extent
   * @param  extent?    Extent Object to set the map to
   * @return map extent -or- this
   */
  map.extent = function(extent) {
    if (!arguments.length) {
      return new Extent(
        context.projection.invert([0, _dimensions[1]]),
        context.projection.invert([_dimensions[0], 0])
      );
    } else {
      return map.centerZoom(extent.center(), map.extentZoom(extent));
    }
  };

  /**
   * trimmedExtent
   * Set/Get the map extent, but include some padding for header, footer, etc.
   * @param  extent?    Extent Object to set the map to
   * @return map extent -or- this
   */
  map.trimmedExtent = function(extent) {
    if (!arguments.length) {
      const headerY = 71;
      const footerY = 30;
      const pad = 10;
      return new Extent(
        context.projection.invert([pad, _dimensions[1] - footerY - pad]),
        context.projection.invert([_dimensions[0] - pad, headerY + pad])
      );
    } else {
      return map.centerZoom(extent.center(), map.trimmedExtentZoom(extent));
    }
  };


  function _calcExtentZoom(extent, dim) {
    const tl = context.projection.project([extent.min[0], extent.max[1]]);
    const br = context.projection.project([extent.max[0], extent.min[1]]);

    // Calculate maximum zoom that fits extent
    const hFactor = (br[0] - tl[0]) / dim[0];
    const vFactor = (br[1] - tl[1]) / dim[1];
    const hZoomDiff = Math.log(Math.abs(hFactor)) / Math.LN2;
    const vZoomDiff = Math.log(Math.abs(vFactor)) / Math.LN2;
    const zoomDiff = Math.max(hZoomDiff, vZoomDiff);

    const currZoom = map.zoom();
    return isFinite(zoomDiff) ? (currZoom - zoomDiff) : currZoom;
  }


  map.extentZoom = (extent) => {
    return _calcExtentZoom(extent, _dimensions);
  };


  map.trimmedExtentZoom = (extent) => {
    const trimY = 120;
    const trimX = 40;
    const trimmed = vecSubtract(_dimensions, [trimX, trimY]);
    return _calcExtentZoom(extent, trimmed);
  };


  map.toggleHighlightEdited = () => {
    surface.classed('highlight-edited', !surface.classed('highlight-edited'));
    map.immediateRedraw();
    dispatch.call('changeHighlighting', this);
  };


  map.areaFillOptions = ['wireframe', 'partial', 'full'];


  map.activeAreaFill = function(val) {
    if (!arguments.length) {
      return prefs('area-fill') || 'partial';
    }

    prefs('area-fill', val);
    if (val !== 'wireframe') {
      prefs('area-fill-toggle', val);
    }
    map.immediateRedraw();
    dispatch.call('changeAreaFill', this);
    return map;
  };


  map.toggleWireFrameMode = () => {
    _wireFrameMode = !_wireFrameMode;
    _renderer.scene.dirtyScene();
    map.immediateRedraw();
  };

  map.wireFrameMode = () => _wireFrameMode;

  map.toggleWireframe = () => {
    let activeFill = map.activeAreaFill();
    map.toggleWireFrameMode();

    if (activeFill === 'wireframe') {
      activeFill = prefs('area-fill-toggle') || 'partial';
    } else {
      activeFill = 'wireframe';
    }

    map.activeAreaFill(activeFill);
    return map;
  };


  map.scene = () => _renderer && _renderer.scene;

  map.renderer = () => _renderer;

  map.redrawEnable = function (val) {
    if (!arguments.length) return _redrawEnabled;
    _redrawEnabled = val;
    return map;
  };


  return utilRebind(map, dispatch, 'on');
}
