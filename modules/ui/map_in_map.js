import * as PIXI from 'pixi.js';
import { zoom as d3_zoom, zoomIdentity as d3_zoomIdentity } from 'd3-zoom';
import { HALF_PI, Viewport, geoZoomToScale, numClamp, vecAdd, vecInterp, vecSubtract } from '@rapid-sdk/math';

import { PixiLayerBackgroundTiles } from '../pixi/PixiLayerBackgroundTiles.js';
//import { PixiEvents } from '../pixi/PixiEvents.js';


export function uiMapInMap(context) {
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const viewMain = context.viewport;
  const viewMini = new Viewport();

  const MIN_Z = 0.5;
  const MAX_Z = 24;
  const MIN_K = geoZoomToScale(MIN_Z);
  const MAX_K = geoZoomToScale(MAX_Z);

  let _wrap = null;
  let _supersurface = null;
  let _surface = null;

  let _isHidden = true;          // start out hidden
  let _skipEvents = false;
  let _gesture = null;
  let _zDiff = 6;        // by default, minimap renders at (main zoom - 6)
  let _tStart;           // d3-zoom transform at start of gesture

  let _miniPixi = null;        // Pixi application for the minimap
  let _miniTileLayer = null;   // Background Tile layer for the minimap


  function mapInMap(selection) {
    const zoom = d3_zoom()
      .scaleExtent([MIN_K, MAX_K])
      .on('start', _zoomStarted)
      .on('zoom', _zoomed)
      .on('end', _zoomEnded);


    /**
     * updateMinimap
     * Call this whenever something about the minimap needs to change
     */
    function updateMinimap() {
      if (_isHidden) return;
      if (!map.renderer?.textures?.loaded) return;
      updateTransform();
      renderBoundingBox();
    }


    /**
     * _zoomEnded
     * d3-zoom callback for when a zoom/pan starts
     */
    function _zoomStarted() {
      if (_skipEvents) return;

      const t = viewMini.transform.props;
      _tStart = d3_zoomIdentity.translate(t.x, t.y).scale(t.k);
      _gesture = null;
    }


    /**
     * _zoomed
     * d3-zoom callback that receives zoom/pan events
     * @param  d3_event   A d3-zoom event, transform contains details about what changed
     */
    function _zoomed(d3_event) {
      if (_skipEvents) return;

      const {x, y, k} = d3_event.transform;

      if (!_gesture) {
        _gesture = (k !== _tStart.k) ? 'zoom' : 'pan';
      }

      // Remove translations from zooms - all zooms should occur at the minimap center.
      if (_gesture === 'zoom') {
        const loc = viewMain.centerLoc();
        const tMain = viewMain.transform.props;
        const cMini = viewMini.center();

        viewMini.transform = { x: tMain.x, y: tMain.y, k: k };
        let xy = viewMini.transform.translation;
        const point = viewMini.project(loc);
        const delta = vecSubtract(cMini, point);
        xy = vecAdd(xy, delta);

        viewMini.transform = { x: xy[0], y: xy[1], k: k };
      } else {
        viewMini.transform = { x: x, y: y, k: k };
      }

      // update `_zDiff` (difference in zoom between main and mini)
      _zDiff = viewMain.transform.zoom - viewMini.transform.zoom;

      updateMinimap();
    }


    /**
     * _zoomEnded
     * d3-zoom callback for when the zoom/pan ends
     */
    function _zoomEnded() {
      if (_skipEvents) return;

      if (_gesture === 'pan') {
        map.center(viewMini.centerLoc());  // recenter main map..
      }

      _tStart = null;
      _gesture = null;

      updateMinimap();
    }


    /**
     * updateTransform
     * Update the minimap viewport and d3-zoom transform
     */
    function updateTransform() {
      // If mini map is changing, skip..
      // The transform was already set in `zoomed`
      if (_tStart) return;

      const loc = viewMain.centerLoc();
      const tMain = viewMain.transform.props;
      const zMain = viewMain.transform.zoom;
      const zMini = numClamp(zMain - _zDiff, MIN_Z, MAX_Z);
      const kMini = geoZoomToScale(zMini);
      const cMini = viewMini.center();

      // update minimap transform
      viewMini.transform = { x: tMain.x, y: tMain.y, k: kMini };
      let xy = viewMini.transform.translation;
      const point = viewMini.project(loc);
      const delta = vecSubtract(cMini, point);
      xy = vecAdd(xy, delta);
      viewMini.transform = { x: xy[0], y: xy[1], k: kMini };

      // update d3-zoom transform
      _skipEvents = true;
      zoom.scaleExtent([MIN_K, geoZoomToScale(zMain - 3)]);
      _supersurface.call(zoom.transform, d3_zoomIdentity.translate(xy[0], xy[1]).scale(kMini));
      _skipEvents = false;
    }


    /**
     * renderBoundingBox
     * Recalculates the position and size of the bounding box rectangle on the minimap
     */
    function renderBoundingBox() {
      const [w, h] = viewMain.dimensions;
      const mainPoints = [[0, 0], [0, h], [w, h], [w, 0], [0, 0]];
      const miniPoints = new Array(mainPoints.length);
      const flatPoints = new Array(mainPoints.length * 2);  // as a flattened array

      const stage = _miniPixi.stage;

      // If user is currently panning, keep the bbox in the center
      // so they can see where the map will translate to.
      let offset = [0, 0];
      const tCurr = viewMini.transform.props;
      if (_tStart && _tStart.k === tCurr.k) {   // `k` unchanged, so user is not zooming
        offset = [tCurr.x - _tStart.x, tCurr.y - _tStart.y];
      }

      // Compute the viewport bounding box coordinates..
      for (let i = 0; i < mainPoints.length; i++) {
        // Unproject from the original screen coords to lon/lat (true = consider rotation)
        // Then project to the coordinates used by the minimap.
        const [x, y] = viewMini.project(viewMain.unproject(mainPoints[i], true));
        miniPoints[i] = vecSubtract([x, y], offset);
        flatPoints[(i * 2)] = x - offset[0];
        flatPoints[(i * 2) + 1] = y - offset[1];
      }

      let bbox = stage.getChildByName('bbox');
      if (!bbox) {
        bbox = new PIXI.Graphics();
        bbox.name = 'bbox';
        bbox.eventMode = 'none';
        stage.addChild(bbox);
      }

      let arrow = stage.getChildByName('arrow');
      if (!arrow) {
        arrow = new PIXI.Container();
        arrow.name = 'arrow';
        arrow.eventMode = 'none';
        stage.addChild(arrow);

        // We're repurposing the 'sided' arrow, so we need to turn it -90°
        const textures = map.renderer.textures;
        const sprite = new PIXI.Sprite(textures.get('sided'));
        sprite.tint = 0xffff00;
        sprite.anchor.set(0, 0.5); // left, middle
        sprite.rotation = -HALF_PI;
        arrow.addChild(sprite);
      }

      bbox
        .clear()
        .lineStyle(2, 0xffff00)
        .drawShape(new PIXI.Polygon(flatPoints));

      // Place an "up" arrow at the "top" of the box.
      const [arrowX, arrowY] = vecInterp(miniPoints[3], miniPoints[4], 0.5);
      arrow.position.set(arrowX, arrowY);
      arrow.rotation = -viewMain.transform.rotation;
    }


    /**
     * toggle
     * Toggles the minimap on/off
     * @param  `d3_event`   d3 keypress event that triggered the toggle (if any)
     */
    function toggle(d3_event) {
      if (d3_event) d3_event.preventDefault();
      if (!_wrap) return;   // called too early?

      _isHidden = !_isHidden;

      context
        .container()
        .select('.minimap-toggle-item')
        .classed('active', !_isHidden)
        .select('input')
        .property('checked', !_isHidden);

      if (_isHidden) {
        _wrap
          .transition()
          .duration(200)
          .style('opacity', '0')
          .on('end', () => {
            selection.selectAll('.map-in-map').style('display', 'none');
            clear();
          });

      } else {
        updateMinimap();
        _wrap
          .style('display', 'block')
          .style('opacity', '0')
          .transition()
          .duration(200)
          .style('opacity', '1');
      }
    }


    /**
     * clear
     * Removes resources used by the minimap when it goes invisible
     */
    function clear() {
      if (_miniTileLayer) {
        _miniTileLayer.destroyAll();
      }
    }


    /**
     * _tick
     * Draw the minimap
     */
    function _tick() {
      if (_isHidden) return;
      if (!map.renderer?.textures?.loaded) return;

      window.performance.mark('minimap-start');
      const frame = 0;    // not used
      _miniTileLayer.render(frame, viewMini);     // APP
      _miniPixi.render();                         // DRAW
      window.performance.mark('minimap-end');
      window.performance.measure('minimap', 'minimap-start', 'minimap-end');
    }


    /**
     * _initMiniPixi
     * Create a separate Pixi application for the minimap
     */
    function _initMiniPixi() {
      if (!_supersurface || !_surface)  return;   // called too early?

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
        sharedTicker: false,
        view: _surface.node()
      });

      // hardcoded dimensions for now
      const [w, h] = [200, 150];
      viewMini.dimensions = [w, h];
      _miniPixi.renderer.resize(w, h);

      // Setup the Ticker
      // Replace the default Ticker listener (which just renders the scene each frame)
      // with our own listener that gathers statistics and renders only as needed
      const ticker = _miniPixi.ticker;
      ticker.maxFPS = 10;      // minimap can be slowed down
      const defaultListener = ticker._head.next;
      ticker.remove(defaultListener.fn, defaultListener.context);
      ticker.add(_tick, this);
      ticker.start();

      // Setup the stage..
      const stage = _miniPixi.stage;
      stage.name = 'minimap-stage';
      stage.eventMode = 'none';
      stage.sortableChildren = false;

      const miniRenderer = {    // Mock Renderer
        context: context,
        supersurface: _supersurface,
        surface: _surface,
        pixi: _miniPixi,
        stage: stage,
        textures: map.renderer.textures
      };
// maybe someday, if we want to replace d3-zoom, we can use Pixi events instead
//      miniRenderer.events = new PixiEvents(miniRenderer);

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

      // replace event listener
      map.off('draw', updateMinimap);
      map.on('draw', updateMinimap);
    }


    /* setup */
    uiMapInMap.toggle = toggle;

    const wrap = selection.selectAll('.map-in-map')
      .data([0]);

    const wrapEnter = wrap.enter()
      .append('div')
      .attr('class', 'map-in-map')
      .style('display', _isHidden ? 'none' : 'block');

    _wrap = wrap.merge(wrapEnter);


    const supersurface = _wrap.selectAll('.supersurface')
      .data([0]);

    const supersurfaceEnter = supersurface.enter()
      .append('div')
      .attr('class', 'supersurface')
      .call(zoom)
      .on('dblclick.zoom', null);

    _supersurface = supersurface.merge(supersurfaceEnter);


    const surface = _supersurface.selectAll('.surface')
      .data([0]);

    const surfaceEnter = surface.enter()
      .append('canvas')
      .attr('class', 'surface');

    _surface = surface.merge(surfaceEnter);


    if (!_miniPixi) {
      _initMiniPixi();
    }

    updateMinimap();

    const key = l10n.t('background.minimap.key');
    context.keybinding().off(key);
    context.keybinding().on(key, toggle);
  }

  return mapInMap;
}
