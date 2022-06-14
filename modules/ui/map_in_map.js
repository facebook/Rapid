import * as PIXI from 'pixi.js';

import { select as d3_select } from 'd3-selection';
import { zoom as d3_zoom, zoomIdentity as d3_zoomIdentity } from 'd3-zoom';
import { Projection, geoScaleToZoom, geoZoomToScale, vecScale, vecSubtract } from '@id-sdk/math';

import { t } from '../core/localizer';
import { utilSetTransform } from '../util';
import { PixiEventsHandler } from '../pixi/PixiEventsHandler';
import { PixiScene } from '../pixi/PixiScene';
import { PixiLayerBackgroundTiles } from '../pixi/PixiLayerBackgroundTiles';
import { PixiFeatureMultipolygon } from '../pixi/PixiFeatureMultipolygon';
// import { utilGetDimensions } from '../util/dimensions';

const minimap_id = 'minimap-bounding-box';

export function uiMapInMap(context) {

   function mapInMap(selection) {
    //    var backgroundLayer = rendererTileLayer(context);
       var overlayLayers = {};
       var projection = new Projection();
       var zoom = d3_zoom()
           .scaleExtent([geoZoomToScale(0.5), geoZoomToScale(24)])
           .on('start', zoomStarted)
           .on('zoom', zoomed)
           .on('end', zoomEnded);

       var wrap = d3_select(null);
       var tiles = d3_select(null);
       var viewport = d3_select(null);

       var _isTransformed = false;
       var _isHidden = true;
       var _skipEvents = false;
       var _gesture = null;
       var _zDiff = 6;    // by default, minimap renders at (main zoom - 6)
       var _dMini;        // dimensions of minimap
       var _cMini;        // center pixel of minimap
       var _tStart;       // transform at start of gesture
       var _tCurr;        // transform at most recent event
       var _timeoutID;

       var bboxPoly;

       function zoomStarted() {
           if (_skipEvents) return;
           _tStart = _tCurr = projection.transform();
           _gesture = null;
       }


       function zoomed(d3_event) {
           if (_skipEvents) return;

           var x = d3_event.transform.x;
           var y = d3_event.transform.y;
           var k = d3_event.transform.k;
           var isZooming = (k !== _tStart.k);
           var isPanning = (x !== _tStart.x || y !== _tStart.y);

           if (!isZooming && !isPanning) {
               return;  // no change
           }

           // lock in either zooming or panning, don't allow both in minimap.
           if (!_gesture) {
               _gesture = isZooming ? 'zoom' : 'pan';
           }

           var tMini = projection.transform();
           var tX, tY, scale;

           if (_gesture === 'zoom') {
               scale = k / tMini.k;
               tX = (_cMini[0] / scale - _cMini[0]) * scale;
               tY = (_cMini[1] / scale - _cMini[1]) * scale;
           } else {
               k = tMini.k;
               scale = 1;
               tX = x - tMini.x;
               tY = y - tMini.y;
           }

           utilSetTransform(tiles, tX, tY, scale);
           utilSetTransform(viewport, 0, 0, scale);
           _isTransformed = true;
           _tCurr = d3_zoomIdentity.translate(x, y).scale(k);

           var zMain = geoScaleToZoom(context.projection.scale());
           var zMini = geoScaleToZoom(k);

           _zDiff = zMain - zMini;

           queueRedraw();
       }


       function zoomEnded() {
           if (_skipEvents) return;
           if (_gesture !== 'pan') return;

           updateprojection();
           _gesture = null;
           context.map().center(projection.invert(_cMini));   // recenter main map..
       }


       function updateprojection() {
           var loc = context.map().center();
           var tMain = context.projection.transform();
           var zMain = geoScaleToZoom(tMain.k);
           var zMini = Math.max(zMain - _zDiff, 0.5);
           var kMini = geoZoomToScale(zMini);

           projection
               .translate([tMain.x, tMain.y])
               .scale(kMini);

           var point = projection.project(loc);
           var mouse = (_gesture === 'pan') ? vecSubtract([_tCurr.x, _tCurr.y], [_tStart.x, _tStart.y]) : [0, 0];
           var xMini = _cMini[0] - point[0] + tMain.x + mouse[0];
           var yMini = _cMini[1] - point[1] + tMain.y + mouse[1];

           projection
               .translate([xMini, yMini])
               .dimensions([[0, 0], _dMini]);

           _tCurr = projection.transform();

           if (_isTransformed) {
               utilSetTransform(tiles, 0, 0);
               utilSetTransform(viewport, 0, 0);
               _isTransformed = false;
           }

           zoom
               .scaleExtent([geoZoomToScale(0.5), geoZoomToScale(zMain - 3)]);

           _skipEvents = true;
           wrap.call(zoom.transform, _tCurr);
           _skipEvents = false;
       }


       function redraw() {
           clearTimeout(_timeoutID);
           if (_isHidden) return;

           updateprojection();
           var zMini = geoScaleToZoom(projection.scale());

           // setup tile container
        //    tiles = wrap
        //        .selectAll('.map-in-map-tiles')
        //        .data([0]);

        //    tiles = tiles.enter()
        //        .append('div')
        //        .attr('class', 'map-in-map-tiles')
        //        .merge(tiles);

        //    // redraw background
        //    backgroundLayer
        //        .source(context.background().baseLayerSource())
        //        .projection(projection)
        //        .dimensions(_dMini);

        //    var background = tiles
        //        .selectAll('.map-in-map-background')
        //        .data([0]);

        //    background.enter()
        //        .append('div')
        //        .attr('class', 'map-in-map-background')
        //        .merge(background)
        //        .call(backgroundLayer);


        //    // redraw overlay
        //    var overlaySources = context.background().overlayLayerSources();
        //    var activeOverlayLayers = [];
        //    for (var i = 0; i < overlaySources.length; i++) {
        //        if (overlaySources[i].validZoom(zMini)) {
        //            if (!overlayLayers[i]) overlayLayers[i] = rendererTileLayer(context);
        //            activeOverlayLayers.push(overlayLayers[i]
        //                .source(overlaySources[i])
        //                .projection.project(projection)
        //                .dimensions(_dMini));
        //        }
        //    }


           // redraw viewport bounding box
           if (_gesture !== 'pan') {
               drawBoundingBox();


           }
       }

       function drawBoundingBox() {
            var bbox = context.map().extent().bbox();

            const topLeftPoint = projection.project([bbox.minX, bbox.minY]);
            const bottomRightPoint = projection.project([bbox.maxX, bbox.maxY]);
            const boxWidth = bottomRightPoint[0] - topLeftPoint[0];
            const boxHeight = bottomRightPoint[1] - topLeftPoint[1];


           let container = context.minipixi.stage;

            if (!bboxPoly) {
                bboxPoly = new PIXI.Polygon(bbox);

                const bboxGraphic = new PIXI.Graphics().clear()
                    .lineStyle(2, 0x00ffff)
                    .drawRect(topLeftPoint[0], topLeftPoint[1], boxWidth, boxHeight);
                container.addChild(bboxGraphic);

            }
       }


       function queueRedraw() {
           clearTimeout(_timeoutID);
           _timeoutID = setTimeout(function() { redraw(); }, 750);
       }


       function toggle(d3_event) {
           if (d3_event) d3_event.preventDefault();

           _isHidden = !_isHidden;

           context.container().select('.minimap-toggle-item')
               .classed('active', !_isHidden)
               .select('input')
               .property('checked', !_isHidden);

           if (_isHidden) {
               wrap
                   .style('display', 'block')
                   .style('opacity', '1')
                   .transition()
                   .duration(200)
                   .style('opacity', '0')
                   .on('end', function() {
                       selection.selectAll('.map-in-map')
                           .style('display', 'none');
                   });
           } else {
               wrap
                   .style('display', 'block')
                   .style('opacity', '0')
                   .transition()
                   .duration(200)
                   .style('opacity', '1')
                   .on('end', function() {
                       redraw();
                   });
           }
       }


       uiMapInMap.toggle = toggle;

       wrap = selection.selectAll('.map-in-map')
           .data([0]);

       wrap = wrap.enter()
           .append('div')
           .attr('class', 'map-in-map')
           .style('display', (_isHidden ? 'none' : 'block'))
           .call(zoom)
           .on('dblclick.zoom', null)
           .merge(wrap);



        this.minipixi = new PIXI.Application({
            antialias: true,
            autoDensity: true,
            autoStart: true,        // don't start the ticker yet
            backgroundAlpha: 0.0,    // transparent
            resolution: window.devicePixelRatio,
            sharedLoader: true,
           sharedTicker: true
       });

       wrap.node().appendChild(this.minipixi.view);


       const width = 200;
       const height = 150;
       this.minipixi.renderer.resize(width, height);

       const miniMapScene = new PixiScene(this.context);
       context.minipixi = this.minipixi;
       const miniMapTileLayer = new PixiLayerBackgroundTiles(this.context, miniMapScene, 1, true);

// Change flight speed every 5 seconds
// setInterval(() => {
//     warpSpeed = warpSpeed > 0 ? 0 : 1;
// }, 5000);

// Listen for animate update
       this.minipixi.ticker.add((delta) => {
//           if (!_tCurr) return;

           const markStart = 'minimap-start';
        const m1 = window.performance.mark(markStart);
        const timestamp = m1.startTime;

        miniMapTileLayer.render(timestamp, projection, 10);
    // // Simple easing. This should be changed to proper easing function when used for real.
    // speed += (warpSpeed - speed) / 20;
    // cameraZ += delta * 10 * (speed + baseSpeed);
    // for (let i = 0; i < starAmount; i++) {
    //     const star = stars[i];
    //     if (star.z < cameraZ) randomizeStar(star);

    //     // Map star 3d position to 2d with really simple projection
    //     const z = star.z - cameraZ;
    //     star.sprite.x = star.x * (fov / z) * width + width / 2;
    //     star.sprite.y = star.y * (fov / z) * width + height / 2;

    //     // Calculate star scale & rotation.
    //     const dxCenter = star.sprite.x - width / 2;
    //     const dyCenter = star.sprite.y - height / 2;
    //     const distanceCenter = Math.sqrt(dxCenter * dxCenter + dyCenter * dyCenter);
    //     const distanceScale = Math.max(0, (2000 - z) / 2000);
    //     star.sprite.scale.x = distanceScale * starBaseSize;
    //     // Star is looking towards center so that y axis is towards center.
    //     // Scale the star depending on how fast we are moving, what the stretchfactor is and depending on how far away it is from the center.
    //     star.sprite.scale.y = distanceScale * starBaseSize + distanceScale * speed * starStretch * distanceCenter / width;
    //     star.sprite.rotation = Math.atan2(dyCenter, dxCenter) + Math.PI / 2;
    // }
});




       // reflow warning: Hardcode dimensions - currently can't resize it anyway..
       _dMini = [200,150]; //utilGetDimensions(wrap);
       _cMini = vecScale(_dMini, 0.5);

       context.map()
           .on('drawn.map-in-map', function(drawn) {
               if (drawn.full === true) {
                   redraw();
               }
           });

       redraw();

       context.keybinding()
           .on(t('background.minimap.key'), toggle);
   }

   return mapInMap;
}
