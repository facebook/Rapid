import * as PIXI from 'pixi.js';
import { select as d3_select } from 'd3-selection';
import { zoom as d3_zoom, zoomIdentity as d3_zoomIdentity } from 'd3-zoom';
import { Viewport, geoScaleToZoom, geoZoomToScale, vecScale, vecSubtract } from '@rapid-sdk/math';

import { PixiLayerBackgroundTiles } from '../pixi/PixiLayerBackgroundTiles.js';
import { utilSetTransform } from '../util/index.js';


export function uiMapInMap(context) {
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const viewMain = context.viewport;

  function mapInMap(selection) {
    let viewMini = new Viewport();
    let zoom = d3_zoom()
      .scaleExtent([geoZoomToScale(0.5), geoZoomToScale(24)])
      .on('start', zoomStarted)
      .on('zoom', zoomed)
      .on('end', zoomEnded);

    let wrap = d3_select(null);
    let canvas = d3_select(null);

    let _isHidden = true;          // start out hidden
    let _isTransformed = false;
    let _skipEvents = false;
    let _gesture = null;
    let _zDiff = 6;        // by default, minimap renders at (main zoom - 6)
    let _dMini;            // dimensions of minimap
    let _cMini;            // center pixel of minimap
    let _tStart;           // transform at start of gesture
    let _tCurr;            // transform at most recent event

    let _miniPixi = null;        // Pixi application for the minimap
    let _miniTileLayer = null;   // Background Tile layer for the minimap


    /**
     * updateMinimap
     * Call this whenever something about the minimap needs to change
     */
    function updateMinimap() {
      if (_isHidden) return;
      updateViewport();
      updateBoundingBox();
    }


    /**
     * zoomEnded
     * d3-zoom callback for when a zoom/pan starts
     */
    function zoomStarted() {
      if (_skipEvents) return;
      _tStart = _tCurr = viewMini.transform.props;
      _gesture = null;
    }


    /**
     * zoomEnded
     * d3-zoom callback that receives zoom/pan events
     * @param  d3_event   A d3-zoom event, transform contains details about what changed
     */
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

      const tMini = viewMini.transform.props;
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
        _miniPixi.stage.x += tX;
        _miniPixi.stage.y += tY;
      } else {
        utilSetTransform(canvas, 0, 0, scale);
      }
      _isTransformed = true;
      _tCurr = d3_zoomIdentity.translate(x, y).scale(k);

      const zMain = geoScaleToZoom(viewMain.transform.zoom);
      const zMini = geoScaleToZoom(k);

      _zDiff = zMain - zMini;

      updateMinimap();
    }


    /**
     * zoomEnded
     * d3-zoom callback for when the zoom/pan ends
     */
    function zoomEnded() {
      if (_skipEvents) return;
      if (_gesture !== 'pan') return;

      updateViewport();
      _gesture = null;
      map.center(viewMini.unproject(_cMini)); // recenter main map..
    }


    /**
     * updateViewport
     * Update the minimap viewport and d3-zoom transform
     */
    function updateViewport() {
      const loc = viewMain.centerLoc();
      const tMain = viewMain.transform.props;
      const zMain = geoScaleToZoom(tMain.k);
      const zMini = Math.max(zMain - _zDiff, 0.5);
      const kMini = geoZoomToScale(zMini);

      viewMini.transform = { x: tMain.x, y: tMain.y, k: kMini };

      const point = viewMini.project(loc);
      const mouse = (_gesture === 'pan') ? vecSubtract([_tCurr.x, _tCurr.y], [_tStart.x, _tStart.y]) : [0, 0];
      const xMini = _cMini[0] - point[0] + tMain.x + mouse[0];
      const yMini = _cMini[1] - point[1] + tMain.y + mouse[1];

      viewMini.transform = { x: xMini, y: yMini };
      viewMini.dimensions = _dMini;

      _tCurr = viewMini.transform.props;

      if (_isTransformed) {
        _miniPixi.stage.x = 0;
        _miniPixi.stage.y = 0;
        utilSetTransform(canvas, 0, 0);
        _isTransformed = false;
      }

      zoom.scaleExtent([geoZoomToScale(0.5), geoZoomToScale(zMain - 3)]);

      _skipEvents = true;
      wrap.call(zoom.transform, _tCurr);
      _skipEvents = false;
    }


    /**
     * updateBoundingBox
     * Recalculates the position and size of the bounding box rectangle on the minimap
     */
    function updateBoundingBox() {
      const bbox = viewMain.visibleExtent().bbox();
      const topLeftPoint = viewMini.project([bbox.minX, bbox.maxY]);
      const bottomRightPoint = viewMini.project([bbox.maxX, bbox.minY]);
      const boxWidth = Math.abs(bottomRightPoint[0] - topLeftPoint[0]);
      const boxHeight = Math.abs(bottomRightPoint[1] - topLeftPoint[1]);

      const stage = _miniPixi.stage;
      let bboxGraphic = stage.getChildByName('bbox');
      if (!bboxGraphic) {
        bboxGraphic = new PIXI.Graphics();
        bboxGraphic.name = 'bbox';
        bboxGraphic.eventMode = 'none';
        stage.addChild(bboxGraphic);
      }

      bboxGraphic
        .clear()
        .lineStyle(2, 0xffff00)
        .drawRect(topLeftPoint[0], topLeftPoint[1], boxWidth, boxHeight);
    }


    /**
     * toggle
     * Toggles the minimap on/off
     * @param  `d3_event`   d3 keypress event that triggered the toggle (if any)
     */
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
          .on('end', () => {
            selection.selectAll('.map-in-map').style('display', 'none');
            clear();
          });
      } else {
        updateMinimap();
        wrap
          .style('display', 'block')
          .style('opacity', '0')
          .transition()
          .duration(200)
          .style('opacity', '1');
      }
    }


    /**
     * clear
     * Removes all resources used by the minimap when it goes invisible
     */
    function clear() {
      const stage = _miniPixi.stage;
      const bboxGraphic = stage.getChildByName('bbox');
      if (bboxGraphic) {
        stage.removeChild(bboxGraphic);
      }

      if (_miniTileLayer) {
        _miniTileLayer.destroyAll();
      }
    }


    /**
     * tick
     * Draw the minimap
     */
    function tick() {
      if (_isHidden) return;
      window.performance.mark('minimap-start');
      const frame = 0;    // not used
      _miniTileLayer.render(frame, viewMini);     // APP
      _miniPixi.render();                         // DRAW
      window.performance.mark('minimap-end');
      window.performance.measure('minimap', 'minimap-start', 'minimap-end');
    }


    /* setup */
    uiMapInMap.toggle = toggle;

    wrap = selection.selectAll('.map-in-map')
      .data([0]);

    let wrapEnter = wrap.enter()
      .append('div')
      .attr('class', 'map-in-map')
      .style('display', _isHidden ? 'none' : 'block')
      .call(zoom)
      .on('dblclick.zoom', null);

    if (!_miniPixi) {
      // Create a separate Pixi application for the minimap
      _miniPixi = new PIXI.Application({
        antialias: true,
        autoDensity: true,
        autoStart: false,   // don't start the ticker yet
        events: {
          move: false,
          globalMove: false,
          click: true,
          wheel: false
        },
        resolution: window.devicePixelRatio,
        sharedLoader: true,
        sharedTicker: false
      });

      const [width, height] = [200, 150];
      _miniPixi.renderer.resize(width, height);

      // Setup the Ticker
      // Replace the default Ticker listener (which just renders the scene each frame)
      // with our own listener that gathers statistics and renders only as needed
      const ticker = _miniPixi.ticker;
      ticker.maxFPS = 10;      // minimap can be slowed down
      const defaultListener = ticker._head.next;
      ticker.remove(defaultListener.fn, defaultListener.context);
      ticker.add(tick, this);
      ticker.start();

      // Setup the stage..
      const stage = _miniPixi.stage;
      stage.name = 'minimap-stage';
      stage.eventMode = 'none';
      stage.sortableChildren = false;

      const mainRenderer = map.renderer;

      // Construct the scene..
      const miniRenderer = {    // Mock Renderer
        context: context,
        pixi: _miniPixi,
        stage: stage,
        textures: mainRenderer.textures
      };

      const miniScene = {   // Mock Scene
        context: context,
        renderer: miniRenderer,
        groups: new Map(),
        layers: new Map(),
        features: new Map()
      };

      // Group Container
      const groupContainer = new PIXI.Container();
      groupContainer.name = 'background';
      stage.addChild(groupContainer);
      miniScene.groups.set('background', groupContainer);

      // Layer
      _miniTileLayer = new PixiLayerBackgroundTiles(miniScene, 'minimap-background', true);  // isMinimap = true
      miniScene.layers.set(_miniTileLayer.id, _miniTileLayer);

      // Hardcode dimensions - currently can't resize it anyway..
      _dMini = [width, height];
      _cMini = vecScale(_dMini, 0.5);

      map.on('draw', () => updateMinimap());
    }

    wrapEnter
      .each((d, i, nodes) => {
        nodes[i].appendChild(_miniPixi.view);
      });

    wrap = wrapEnter
      .merge(wrap);

    // canvas = wrap.selectAll('canvas');
    canvas = d3_select(_miniPixi.view);

    updateMinimap();

    context.keybinding().on(l10n.t('background.minimap.key'), toggle);
  }

  return mapInMap;
}
