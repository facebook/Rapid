import { dispatch as d3_dispatch } from 'd3-dispatch';
import { interpolate as d3_interpolate } from 'd3-interpolate';
import { select as d3_select } from 'd3-selection';
import { zoom as d3_zoom, zoomIdentity as d3_zoomIdentity } from 'd3-zoom';

import { Projection, Extent, geoMetersToLon, geoScaleToZoom, geoZoomToScale, vecAdd, vecScale, vecSubtract } from '@id-sdk/math';
import _throttle from 'lodash-es/throttle';
import _debounce from 'lodash-es/debounce';

import { PixiRenderer } from '../pixi/PixiRenderer';

import { prefs } from '../core/preferences';
import { modeBrowse } from '../modes/browse';
import { utilFastMouse, utilSetTransform, utilTotalExtent } from '../util/util';
import { utilBindOnce } from '../util/bind_once';
import { utilDetect } from '../util/detect';
import { utilGetDimensions } from '../util/dimensions';
import { utilRebind } from '../util/rebind';
import { utilZoomPan } from '../util/zoom_pan';
import { utilDoubleUp } from '../util/double_up';

// constants
var TILESIZE = 256;
var MINZOOM = 2;
var MAXZOOM = 24;
var MINK = geoZoomToScale(MINZOOM, TILESIZE);
var MAXK = geoZoomToScale(MAXZOOM, TILESIZE);


function clamp(num, min, max) {
  return Math.max(min, Math.min(num, max));
}

export function rendererMap(context) {
  const dispatch = d3_dispatch('move', 'drawn', 'changeHighlighting', 'changeAreaFill');
  let projection = context.projection;
  let curtainProjection = context.curtainProjection;

  let _selection = d3_select(null);
  let supersurface = d3_select(null);
  let surface = d3_select(null);

  let _renderer;

  let _dimensions = [1, 1];
  let _dblClickZoomEnabled = true;
  let _redrawEnabled = true;
  let _gestureTransformStart;
  let _transformStart = projection.transform();
  let _transformLast;
  let _isTransformed = false;
  let _getMouseCoords;

  // let _preDragTransform;
  // whether a pointerdown event started the zoom
//  let _pointerDown = false;

  // whether a sub-feature of the map is currently being dragged around. We should stop zooming/panning if so.
   let _dragging = false;

  const _zoomPanHandler = d3_zoom()    //utilZoomPan()
    .scaleExtent([MINK, MAXK])
    // .interpolate(d3_interpolate)
    // .filter(zoomEventFilter)
    .on('zoom.map', zoomPan);
//    .on('start.map', d3_event => {
//      _pointerDown = d3_event && (d3_event.type === 'pointerdown' ||
//        (d3_event.sourceEvent && d3_event.sourceEvent.type === 'pointerdown'));
//    })
//    .on('end.map', () => {
//      _pointerDown = false;
//    });

  // const _doubleTapHandler = utilDoubleUp();

  /**
   *  map
   */
  function map(selection) {
    _selection = selection;

    // Selection here contains a D3 selection for the `main-map` div that the map gets added to
    // It's an absolutely positioned div that takes up as much space as it's allowed to.
    selection
      // Suppress the native right-click context menu
      .on('contextmenu', e => e.preventDefault())
      // Suppress swipe-to-navigate browser pages on trackpad/magic mouse – #5552
      .on('wheel.map mousewheel.map', e => e.preventDefault())
      .call(_zoomPanHandler);
      // .call(_doubleTapHandler);
      // .call(_zoomPanHandler.transform, projection.transform())
      // .on('dblclick.zoom', null); // override d3-zoom dblclick handling

    // The supersurface is a wrapper div that we temporarily transform as the user zooms and pans.
    // This allows us to defer actual rendering until the browser has more time to do it.
    // At regular intervals we reset this root transform and actually redraw the map.
    map.supersurface = supersurface = selection.append('div')
      .attr('class', 'supersurface')
      .call(utilSetTransform, 0, 0);

    // Content beneath the supersurface may be transformed and will need to rerender sometimes.
    // This includes the background tile layer, the overlay tile layer, and the Pixi WebGL canvas.
    let pixiContainer = map.supersurface
      .append('div')
      .attr('class', 'layer pixi-data')
      .style('z-index', '3');   // above background and overlay

    _renderer = new PixiRenderer(context, pixiContainer.node());

    // Historically `surface` was the root of the SVG DOM - Now it's the Pixi WebGL canvas.
    // Things that will not work anymore:
    //  - d3 selecting surface's child stuff
    //  - css classing surface's child stuff
    //  - listening to events on the surface
    map.surface = surface = pixiContainer.selectAll('canvas');

//     surface
//       .call(_doubleTapHandler);
//        .on('pointerdown.zoom', d3_event => {
//          if (d3_event.button === 2) {
//            d3_event.stopPropagation();
//          }
//        }, true)
//        .on('pointerup.zoom', d3_event => {
//          if (resetTransform()) {
//            map.immediateRedraw();
//          }
//        })

    map.dimensions(utilGetDimensions(selection));


//
//    _doubleTapHandler
//      .on('doubleUp.map', (d3_event, p0) => {
//        if (!_dblClickZoomEnabled) return;
//
////      // don't zoom if targeting something other than the map itself
////      if (typeof d3_event.target.__data__ === 'object' &&
////          // or area fills
////          !d3_select(d3_event.target).classed('fill')) return;
//
//        const zoomOut = d3_event.shiftKey;
//        let t = projection.transform();
//        let p1 = t.invert(p0);
//        t = t.scale(zoomOut ? 0.5 : 2);
//        t.x = p0[0] - p1[0] * t.k;
//        t.y = p0[1] - p1[1] * t.k;
//        map.transformEase(t);
//      });

    //
    // Setup events that cause the map to redraw
    //

    context
      .on('change.map', map.immediateRedraw);

    // context.features()
    //   .on('redraw.map', map.immediateRedraw);

    const osm = context.connection();
    if (osm) {
      osm.on('change.map', map.immediateRedraw);
    }

    function didUndoOrRedo(targetTransform) {
      const mode = context.mode().id;
      if (mode !== 'browse' && mode !== 'select') return;
      if (targetTransform) {
        map.transformEase(targetTransform);
      }
    }

    context.history()
      .on('merge.map', entityIDs => {
        if (entityIDs) {
          _renderer.dirtyEntities(entityIDs);
        }
        map.deferredRedraw();
      })
      .on('change.map', difference => {
        if (difference) {
          _renderer.dirtyEntities(Object.keys(difference.complete()));
        }
        map.immediateRedraw();
      })
      .on('undone.map', (stack, fromStack) => didUndoOrRedo(fromStack.transform))
      .on('redone.map', (stack) => didUndoOrRedo(stack.transform));

    context.background()
      .on('change.map', map.immediateRedraw);

    _renderer.layers
      .on('change.map', function() {
        context.background().updateImagery();
        map.immediateRedraw();
    });

  }


//    function zoomEventFilter(d3_event) {
//      // Fix for #2151, (see also d3/d3-zoom#60, d3/d3-brush#18)
//      // Intercept `mousedown` and check if there is an orphaned zoom gesture.
//      // This can happen if a previous `mousedown` occurred without a `mouseup`.
//      // If we detect this, dispatch `mouseup` to complete the orphaned gesture,
//      // so that d3-zoom won't stop propagation of new `mousedown` events.
//      if (d3_event.type === 'mousedown') {
//        let hasOrphan = false;
//        let listeners = window.__on;
//        for (let i = 0; i < listeners.length; i++) {
//          const listener = listeners[i];
//          if (listener.name === 'zoom' && listener.type === 'mouseup') {
//            hasOrphan = true;
//            break;
//          }
//        }
//        if (hasOrphan) {
//          let event = window.CustomEvent;
//          if (event) {
//            event = new event('mouseup');
//          } else {
//            event = window.document.createEvent('Event');
//            event.initEvent('mouseup', false, false);
//          }
//          // Event needs to be dispatched with an event.view property.
//          event.view = window;
//          window.dispatchEvent(event);
//        }
//      }
//
//      return d3_event.button !== 2;  // ignore right clicks
//    }


    function pxCenter() {
      return vecScale(_dimensions, 0.5);
    }


    map.init = function() {
      /* noop */
    };

    // Throttled redraw - Redraw no more than once every n milliseconds.
    const throttledRedraw = _throttle(redraw, 200);

    // Debounced redraw - Wait n milliseconds after these calls stop to draw again.
    const debouncedRedraw = _debounce(redraw, 100);

    // Our deferral strategy is to use debounce if we are zooming and throttle otherwise
    map.deferredRedraw = function() {
      if (_isTransformed && _transformLast.k !== _transformStart.k) {
        throttledRedraw.cancel();
        debouncedRedraw();
      } else {
        throttledRedraw();
      }
    };

    // Immediate redraw
    map.immediateRedraw = function() {
      throttledRedraw.cancel();
      debouncedRedraw.cancel();
      redraw();
    };


//    function gestureChange(d3_event) {
//      // Remap Safari gesture events to wheel events - #5492
//      // We want these disabled most places, but enabled for zoom/unzoom on map surface
//      // https://developer.mozilla.org/en-US/docs/Web/API/GestureEvent
//      const e = d3_event;
//      e.preventDefault();
//
//      const props = {
//        deltaMode: 0,    // dummy values to ignore in zoomPan
//        deltaY: 1,       // dummy values to ignore in zoomPan
//        clientX: e.clientX,
//        clientY: e.clientY,
//        screenX: e.screenX,
//        screenY: e.screenY,
//        x: e.x,
//        y: e.y
//      };
//
//      let e2 = new WheelEvent('wheel', props);
//      e2._scale = e.scale;          // preserve the original scale
//      e2._rotation = e.rotation;    // preserve the original rotation
//
//      _selection.node().dispatchEvent(e2);
//    }


  function zoomPan(event, key, transform) {
     if (_dragging) return;

        var source = event && event.sourceEvent || event;
        var eventTransform = transform || (event && event.transform);
        var x = eventTransform.x;
        var y = eventTransform.y;
        var k = eventTransform.k;

        // Special handling of 'wheel' events:
        // They might be triggered by the user scrolling the mouse wheel,
        // or 2-finger pinch/zoom gestures, the transform may need adjustment.
        if (source && source.type === 'wheel') {

//            // assume that the gesture is already handled by pointer events
//            if (_pointerDown) return;

            var detected = utilDetect();
            var dX = source.deltaX;
            var dY = source.deltaY;
            var x2 = x;
            var y2 = y;
            var k2 = k;
            var t0, p0, p1;

            // Normalize mousewheel scroll speed (Firefox) - #3029
            // If wheel delta is provided in LINE units, recalculate it in PIXEL units
            // We are essentially redoing the calculations that occur here:
            //   https://github.com/d3/d3-zoom/blob/78563a8348aa4133b07cac92e2595c2227ca7cd7/src/zoom.js#L203
            // See this for more info:
            //   https://github.com/basilfx/normalize-wheel/blob/master/src/normalizeWheel.js
            if (source.deltaMode === 1 /* LINE */ ) {
                // Convert from lines to pixels, more if the user is scrolling fast.
                // (I made up the exp function to roughly match Firefox to what Chrome does)
                // These numbers should be floats, because integers are treated as pan gesture below.
                var lines = Math.abs(source.deltaY);
                var sign = (source.deltaY > 0) ? 1 : -1;
                dY = sign * clamp(
                    Math.exp((lines - 1) * 0.75) * 4.000244140625,
                    4.000244140625, // min
                    350.000244140625 // max
                );

                // On Firefox Windows and Linux we always get +/- the scroll line amount (default 3)
                // There doesn't seem to be any scroll acceleration.
                // This multiplier increases the speed a little bit - #5512
                if (detected.os !== 'mac') {
                    dY *= 5;
                }

                // recalculate x2,y2,k2
                t0 = _isTransformed ? _transformLast : _transformStart;
                p0 = _getMouseCoords(source);
                p1 = t0.invert(p0);
                k2 = t0.k * Math.pow(2, -dY / 500);
                k2 = clamp(k2, MINK, MAXK);
                x2 = p0[0] - p1[0] * k2;
                y2 = p0[1] - p1[1] * k2;

                // 2 finger map pinch zooming (Safari) - #5492
                // These are fake `wheel` events we made from Safari `gesturechange` events..
            } else if (source._scale) {
                // recalculate x2,y2,k2
                t0 = _gestureTransformStart;
                p0 = _getMouseCoords(source);
                p1 = t0.invert(p0);
                k2 = t0.k * source._scale;
                k2 = clamp(k2, MINK, MAXK);
                x2 = p0[0] - p1[0] * k2;
                y2 = p0[1] - p1[1] * k2;

                // 2 finger map pinch zooming (all browsers except Safari) - #5492
                // Pinch zooming via the `wheel` event will always have:
                // - `ctrlKey = true`
                // - `deltaY` is not round integer pixels (ignore `deltaX`)
            } else if (source.ctrlKey && !isInteger(dY)) {
                dY *= 6; // slightly scale up whatever the browser gave us

                // recalculate x2,y2,k2
                t0 = _isTransformed ? _transformLast : _transformStart;
                p0 = _getMouseCoords(source);
                p1 = t0.invert(p0);
                k2 = t0.k * Math.pow(2, -dY / 500);
                k2 = clamp(k2, MINK, MAXK);
                x2 = p0[0] - p1[0] * k2;
                y2 = p0[1] - p1[1] * k2;

                // Trackpad scroll zooming with shift or alt/option key down
            } else if ((source.altKey || source.shiftKey) && isInteger(dY)) {
                // recalculate x2,y2,k2
                t0 = _isTransformed ? _transformLast : _transformStart;
                p0 = _getMouseCoords(source);
                p1 = t0.invert(p0);
                k2 = t0.k * Math.pow(2, -dY / 500);
                k2 = clamp(k2, MINK, MAXK);
                x2 = p0[0] - p1[0] * k2;
                y2 = p0[1] - p1[1] * k2;

                // 2 finger map panning (Mac only, all browsers except Firefox #8595) - #5492, #5512
                // Panning via the `wheel` event will always have:
                // - `ctrlKey = false`
                // - `deltaX`,`deltaY` are round integer pixels
            } else if (detected.os === 'mac' && detected.browser !== 'Firefox' && !source.ctrlKey && isInteger(dX) && isInteger(dY)) {
                p1 = projection.translate();
                x2 = p1[0] - dX;
                y2 = p1[1] - dY;
                k2 = projection.scale();
                k2 = clamp(k2, MINK, MAXK);
            }

            // something changed - replace the event transform
            if (x2 !== x || y2 !== y || k2 !== k) {
                x = x2;
                y = y2;
                k = k2;
                eventTransform = d3_zoomIdentity.translate(x2, y2).scale(k2);
                if (_zoomPanHandler._transform) {
                    // utilZoomPan interface
                    _zoomPanHandler._transform(eventTransform);
                } else {
                    // d3_zoom interface
                    _selection.node().__zoom = eventTransform;
                }
            }
        }

        if (_transformStart.x === x &&
            _transformStart.y === y &&
            _transformStart.k === k) {
            return; // no change
        }

        k = clamp(k, MINK, MAXK);

        projection.transform(eventTransform);

        var scale = k / _transformStart.k;
        var tX = (x / scale - _transformStart.x) * scale;
        var tY = (y / scale - _transformStart.y) * scale;

        if (context.inIntro()) {
            curtainProjection.transform({
                x: x - tX,
                y: y - tY,
                k: k
            });
        }

        _isTransformed = true;
        _transformLast = eventTransform;

        utilSetTransform(supersurface, tX, tY, scale);
        map.deferredRedraw();

        dispatch.call('move', this, map);

        function isInteger(val) {
            return typeof val === 'number' && isFinite(val) && Math.floor(val) === val;
        }
    }


    function resetTransform() {
      if (!_isTransformed) return false;

      utilSetTransform(supersurface, 0, 0);
      _isTransformed = false;
      if (context.inIntro()) {
          curtainProjection.transform(projection.transform());
      }
      return true;
    }


    function redraw() {
      if (surface.empty() || !_redrawEnabled) return;

      resetTransform();
      supersurface.call(context.background());

      if (_renderer) {
        _renderer.render();
      }

      _transformStart = projection.transform();
    }


    map.mouse = function(d3_event) {
      let event = d3_event;
      if (event) {
        let s;
        while ((s = event.sourceEvent)) { event = s; }
        return _getMouseCoords(event);
      }
      return null;
    };


    // returns Lng/Lat
    map.mouseCoordinates = function() {
      const coord = map.mouse() || pxCenter();
      return projection.invert(coord);
    };


    function setTransform(t2, duration, force) {
      const t = projection.transform();
      if (!force && t2.k === t.k && t2.x === t.x && t2.y === t.y) return false;

      if (duration) {
        _selection
          .transition()
          .duration(duration)
          .on('start', () => map.startEase())
          .call(_zoomPanHandler.transform, d3_zoomIdentity.translate(t2.x, t2.y).scale(t2.k));
      } else {
        projection.transform(t2);
        _transformStart = t2;
        _selection.call(_zoomPanHandler.transform, _transformStart);
      }

      return true;
    }


    function setCenterZoom(loc2, z2, duration, force) {
      const c = map.center();
      const z = map.zoom();
      if (loc2[0] === c[0] && loc2[1] === c[1] && z2 === z && !force) return false;

      const k2 = clamp(geoZoomToScale(z2, TILESIZE), MINK, MAXK);
      let proj = new Projection();
      proj.transform(projection.transform()); // make copy
      proj.scale(k2);

      let t = proj.translate();
      const point = proj.project(loc2);
      const center = pxCenter();
      const delta = vecSubtract(center, point);
      t = vecAdd(t, delta);

      return setTransform(d3_zoomIdentity.translate(t[0], t[1]).scale(k2), duration, force);
    }


    map.pan = function(delta, duration) {
      let t = projection.translate();
      let k = projection.scale();

      t = vecAdd(t, delta);

      if (duration) {
        _selection
          .transition()
          .duration(duration)
          .on('start', () => map.startEase())
          .call(_zoomPanHandler.transform, d3_zoomIdentity.translate(t[0], t[1]).scale(k));
      } else {
        projection.translate(t);
        _transformStart = projection.transform();
        _selection.call(_zoomPanHandler.transform, _transformStart);
        dispatch.call('move', this, map);
        map.immediateRedraw();
      }

      return map;
    };


    map.dimensions = function(val) {
      if (!arguments.length) return _dimensions;

      _dimensions = val;
      context.background().dimensions(_dimensions);
      projection.dimensions([[0, 0], _dimensions]);
      _getMouseCoords = utilFastMouse(supersurface.node());

      map.deferredRedraw();
      return map;
    };


    function zoomIn(delta) {
      setCenterZoom(map.center(), ~~map.zoom() + delta, 250, true);
    }

    function zoomOut(delta) {
      setCenterZoom(map.center(), ~~map.zoom() - delta, 250, true);
    }

    map.zoomIn = () => zoomIn(1);
    map.zoomInFurther = () => zoomIn(4);
    map.canZoomIn = () => map.zoom() < MAXZOOM;

    map.zoomOut = () => zoomOut(1);
    map.zoomOutFurther = () => zoomOut(4);
    map.canZoomOut = () => map.zoom() > MINZOOM;


    map.center = function(loc2) {
      if (!arguments.length) {
        return projection.invert(pxCenter());
      }

      if (setCenterZoom(loc2, map.zoom())) {
        dispatch.call('move', this, map);
      }

      map.deferredRedraw();
      return map;
    };


    // The "effective" zoom can be more useful for controlling the experience of the user.
    // This zoom is adjusted by latitude.
    //
    // You can think of it as "what the zoom would be if we were editing at the equator"
    //
    // For example, if we are editing in Murmansk, Russia, at about 69° North latitude,
    // a true zoom of 14.6 corresponds to an effective zoom of 16.
    //
    // Put another way, even at z14.6 the user should be allowed to edit the map,
    // and it should be styled as if it were z16.
    //
    map.effectiveZoom = function() {
      const lat = map.center()[1];
      const z = map.zoom();
      const atLatitude = geoMetersToLon(1, lat);
      const atEquator = geoMetersToLon(1, 0);
      const extraZoom = Math.log(atLatitude / atEquator) / Math.LN2;
      return Math.min(z + extraZoom, MAXZOOM);
    };


    map.zoom = function(z2) {
      if (!arguments.length) {
        return Math.max(geoScaleToZoom(projection.scale(), TILESIZE), 0);
      }

      z2 = clamp(z2, MINZOOM, MAXZOOM);

      if (setCenterZoom(map.center(), z2)) {
        dispatch.call('move', this, map);
      }

      map.deferredRedraw();
      return map;
    };


    map.centerZoom = function(loc2, z2) {
      if (setCenterZoom(loc2, z2)) {
        dispatch.call('move', this, map);
      }

      map.deferredRedraw();
      return map;
    };


    map.zoomTo = function(entity) {
      const extent = entity.extent(context.graph());
      if (!isFinite(extent.area())) return map;

      const z2 = clamp(map.trimmedExtentZoom(extent), 0, 20);
      return map.centerZoom(extent.center(), z2);
    };


    map.centerEase = function(loc2, duration) {
      duration = duration || 250;
      setCenterZoom(loc2, map.zoom(), duration);
      return map;
    };


    map.zoomEase = function(z2, duration) {
      duration = duration || 250;
      setCenterZoom(map.center(), z2, duration, false);
      return map;
    };


    map.centerZoomEase = function(loc2, z2, duration) {
      duration = duration || 250;
      setCenterZoom(loc2, z2, duration, false);
      return map;
    };


    map.transformEase = function(t2, duration) {
      duration = duration || 250;
      setTransform(t2, duration, false /* don't force */ );
      return map;
    };


    map.zoomToEase = function(val, duration) {
      let extent;
      if (Array.isArray(val)) {
        extent = utilTotalExtent(val, context.graph());
      } else {
        extent = val.extent(context.graph());
      }
      if (!isFinite(extent.area())) return map;

      const z2 = clamp(map.trimmedExtentZoom(extent), 0, 20);
      return map.centerZoomEase(extent.center(), z2, duration);
    };


    map.startEase = function() {
      utilBindOnce(surface, 'pointerdown.ease', () => map.cancelEase());
      return map;
    };


    map.cancelEase = function() {
      _selection.interrupt();
      return map;
    };


    map.extent = function(extent) {
      if (!arguments.length) {
        return new Extent(
          projection.invert([0, _dimensions[1]]),
          projection.invert([_dimensions[0], 0])
        );
      } else {
        map.centerZoom(extent.center(), map.extentZoom(extent));
      }
    };


    map.trimmedExtent = function(extent) {
      if (!arguments.length) {
        const headerY = 71;
        const footerY = 30;
        const pad = 10;
        return new Extent(
          projection.invert([pad, _dimensions[1] - footerY - pad]),
          projection.invert([_dimensions[0] - pad, headerY + pad])
        );
      } else {
        map.centerZoom(extent.center(), map.trimmedExtentZoom(extent));
      }
    };


    function calcExtentZoom(extent, dim) {
      const tl = projection.project([extent.min[0], extent.max[1]]);
      const br = projection.project([extent.max[0], extent.min[1]]);

      // Calculate maximum zoom that fits extent
      const hFactor = (br[0] - tl[0]) / dim[0];
      const vFactor = (br[1] - tl[1]) / dim[1];
      const hZoomDiff = Math.log(Math.abs(hFactor)) / Math.LN2;
      const vZoomDiff = Math.log(Math.abs(vFactor)) / Math.LN2;
      const zoomDiff = Math.max(hZoomDiff, vZoomDiff);

      const currZoom = map.zoom();
      return isFinite(zoomDiff) ? (currZoom - zoomDiff) : currZoom;
    }


    map.extentZoom = function(extent) {
      return calcExtentZoom(extent, _dimensions);
    };


    map.trimmedExtentZoom = function(extent) {
      const trimY = 120;
      const trimX = 40;
      const trimmed = vecSubtract(_dimensions, [trimX, trimY]);
      return calcExtentZoom(extent, trimmed);
    };


    map.toggleHighlightEdited = function() {
      surface.classed('highlight-edited', !surface.classed('highlight-edited'));
      map.immediateRedraw();
      dispatch.call('changeHighlighting', this);
    };


    map.areaFillOptions = ['wireframe', 'partial', 'full'];


    map.activeAreaFill = function(val) {
      if (!arguments.length) return prefs('area-fill') || 'partial';

      prefs('area-fill', val);
      if (val !== 'wireframe') {
        prefs('area-fill-toggle', val);
      }
      map.immediateRedraw();
      dispatch.call('changeAreaFill', this);
      return map;
    };


    map.toggleWireframe = function() {
      let activeFill = map.activeAreaFill();

      if (activeFill === 'wireframe') {
        activeFill = prefs('area-fill-toggle') || 'partial';
      } else {
        activeFill = 'wireframe';
      }

      map.activeAreaFill(activeFill);
      return map;
    };


    map.layers = function() {
      return _renderer && _renderer.layers;
    };

    map.renderer = function() {
      return _renderer;
    };

    map.dblclickZoomEnable = function(val) {
      if (!arguments.length) return _dblClickZoomEnabled;
      _dblClickZoomEnabled = val;
      return map;
    };

    map.handleDragStart = () => {
      _dragging = true;
      // _preDragTransform = _zoomPanHandler._transform();
    };

    map.handleDragEnd = () => {
      _dragging = false;
      // _zoomPanHandler._transform(_preDragTransform);
    };

    map.redrawEnable = function(val) {
      if (!arguments.length) return _redrawEnabled;
      _redrawEnabled = val;
      return map;
    };

//    map.isTransformed = function() {
//      return _isTransformed;
//    };

//    map.doubleUpHandler = function() {
//      return _doubleTapHandler;
//    };

    return utilRebind(map, dispatch, 'on');
}
