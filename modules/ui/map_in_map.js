import * as PIXI from 'pixi.js';
import { select as d3_select } from 'd3-selection';
import { zoom as d3_zoom, zoomIdentity as d3_zoomIdentity } from 'd3-zoom';
import { Projection, geoScaleToZoom, geoZoomToScale, vecScale, vecSubtract } from '@id-sdk/math';

import { t } from '../core/localizer';
import { utilSetTransform } from '../util';
import { PixiScene } from '../pixi/PixiScene';
import { PixiLayerBackgroundTiles } from '../pixi/PixiLayerBackgroundTiles';


export function uiMapInMap(context) {

  function mapInMap(selection) {
    let projection = new Projection();
    let zoom = d3_zoom()
      .scaleExtent([geoZoomToScale(0.5), geoZoomToScale(24)])
      .on('start', zoomStarted)
      .on('zoom', zoomed)
      .on('end', zoomEnded);

    let wrap = d3_select(null);
    let canvas = d3_select(null);
    let miniMapTileLayer = null;

    let _isTransformed = false;
    let _isHidden = true;
    let _skipEvents = false;
    let _gesture = null;
    let _zDiff = 6;  // by default, minimap renders at (main zoom - 6)
    let _dMini;      // dimensions of minimap
    let _cMini;      // center pixel of minimap
    let _tStart;     // transform at start of gesture
    let _tCurr;      // transform at most recent event


    function zoomStarted() {
      if (_skipEvents) return;
      _tStart = _tCurr = projection.transform();
      _gesture = null;
    }


    function zoomed(d3_event) {
      if (_skipEvents) return;

      let x = d3_event.transform.x;
      let y = d3_event.transform.y;
      let k = d3_event.transform.k;
      const isZooming = (k !== _tStart.k);
      const isPanning = (x !== _tStart.x || y !== _tStart.y);

      if (!isZooming && !isPanning) return;   // no change

      // lock in either zooming or panning, don't allow both in minimap.
      if (!_gesture) {
        _gesture = isZooming ? 'zoom' : 'pan';
      }

      const tMini = projection.transform();
      let tX, tY, scale;

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

      if (_gesture === 'pan') {
       miniMapTileLayer.container.position.x += tX;
       miniMapTileLayer.container.position.y += tY;
      } else {
        utilSetTransform(canvas, 0, 0, scale);
      }
      _isTransformed = true;
      _tCurr = d3_zoomIdentity.translate(x, y).scale(k);

      const zMain = geoScaleToZoom(context.projection.scale());
      const zMini = geoScaleToZoom(k);

      _zDiff = zMain - zMini;

      redraw();
    }


    function zoomEnded() {
      if (_skipEvents) return;
      if (_gesture !== 'pan') return;

      updateprojection();
      _gesture = null;
      context.map().center(projection.invert(_cMini)); // recenter main map..
    }


    function updateprojection() {
      const loc = context.map().center();
      const tMain = context.projection.transform();
      const zMain = geoScaleToZoom(tMain.k);
      const zMini = Math.max(zMain - _zDiff, 0.5);
      const kMini = geoZoomToScale(zMini);

      projection.translate([tMain.x, tMain.y]).scale(kMini);

      const point = projection.project(loc);
      const mouse = (_gesture === 'pan') ? vecSubtract([_tCurr.x, _tCurr.y], [_tStart.x, _tStart.y]) : [0, 0];
      const xMini = _cMini[0] - point[0] + tMain.x + mouse[0];
      const yMini = _cMini[1] - point[1] + tMain.y + mouse[1];

      projection.translate([xMini, yMini]).dimensions([[0, 0], _dMini]);

      _tCurr = projection.transform();

      if (_isTransformed) {
        const tileContainer = miniMapTileLayer.container;
        tileContainer.position.x = 0;
        tileContainer.position.y = 0;

        utilSetTransform(canvas, 0, 0);
        _isTransformed = false;
      }

      zoom.scaleExtent([geoZoomToScale(0.5), geoZoomToScale(zMain - 3)]);

      _skipEvents = true;
      wrap.call(zoom.transform, _tCurr);
      _skipEvents = false;
    }


    function redraw() {
      if (_isHidden) return;
      updateprojection();
      drawBoundingBox();
    }


    /**
     * drawBoundingBox
     * Simple bounding box draw assuming that there will only ever be the one bounding box
     * inside the 'bbox' container. If there is no 'bbox' container on the minimap stage, it will create one.
     */
    function drawBoundingBox() {
      const bbox = context.map().extent().bbox();
      const topLeftPoint = projection.project([bbox.minX, bbox.maxY]);
      const bottomRightPoint = projection.project([bbox.maxX, bbox.minY]);
      const boxWidth = Math.abs(bottomRightPoint[0] - topLeftPoint[0]);
      const boxHeight = Math.abs(bottomRightPoint[1] - topLeftPoint[1]);

      const container = context.miniPixi.stage;
      container.name = 'minimap-stage';

      const bboxContainer = container.getChildByName('bbox');
      if (!bboxContainer) {
        const bboxContainer = new PIXI.Container();
        bboxContainer.name = 'bbox';
        bboxContainer.interactiveChildren = false;
        bboxContainer.buttonMode = false;
        bboxContainer.interactive = false;
        container.addChild(bboxContainer);

        const bboxGraphic = new PIXI.Graphics()
          .clear()
          .lineStyle(2, 0x00ffff)
          .drawRect(topLeftPoint[0], topLeftPoint[1], boxWidth, boxHeight);

        bboxContainer.addChild(bboxGraphic);

      } else {
        const bboxPolyGraphic = bboxContainer.children[0];
        bboxPolyGraphic
          .clear()
          .lineStyle(2, 0x00ffff)
          .drawRect(topLeftPoint[0], topLeftPoint[1], boxWidth, boxHeight);
      }
    }


    function toggle(d3_event) {
      if (d3_event) d3_event.preventDefault();

      _isHidden = !_isHidden;

      context
        .container()
        .select('.minimap-toggle-item')
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
          .on('end', () => selection.selectAll('.map-in-map').style('display', 'none'));
      } else {
        wrap
          .style('display', 'block')
          .style('opacity', '0')
          .transition()
          .duration(200)
          .style('opacity', '1')
          .on('end', ()  => redraw());
      }
    }

    uiMapInMap.toggle = toggle;

    wrap = selection.selectAll('.map-in-map')
      .data([0]);

    wrap = wrap.enter()
      .append('div')
      .attr('class', 'map-in-map')
      .style('display', _isHidden ? 'none' : 'block')
      .call(zoom)
      .on('dblclick.zoom', null)
      .merge(wrap);

    this.miniPixi = new PIXI.Application({
      antialias: true,
      autoDensity: true,
      autoStart: true,        // don't start the ticker yet
      backgroundAlpha: 0.0,   // transparent
      resolution: window.devicePixelRatio,
      sharedLoader: true,
      sharedTicker: true,
    });

    wrap.node().appendChild(this.miniPixi.view);
    canvas = wrap.selectAll('canvas');

    const width = 200;
    const height = 150;
    this.miniPixi.renderer.resize(width, height);

    const miniRenderer = { context: this.context }; // mock one
    const miniScene = new PixiScene(miniRenderer);
    context.miniPixi = this.miniPixi;

    miniMapTileLayer = new PixiLayerBackgroundTiles(miniScene, 1, true);  // isMinimap = true

    this.miniPixi.ticker.add(timestamp => {
      window.performance.mark('minimap-start');
      miniMapTileLayer.render(timestamp, projection, 10);
      window.performance.mark('minimap-end');
    });

    // reflow warning: Hardcode dimensions - currently can't resize it anyway..
    _dMini = [200, 150]; //utilGetDimensions(wrap);
    _cMini = vecScale(_dMini, 0.5);

    context.map().on('drawn.map-in-map', function(drawn) {
      if (drawn.full === true) {
        redraw();
      }
    });

    redraw();

    context.keybinding().on(t('background.minimap.key'), toggle);
  }

  return mapInMap;
}
