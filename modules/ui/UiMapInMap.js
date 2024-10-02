import * as PIXI from 'pixi.js';
import { zoom as d3_zoom, zoomIdentity as d3_zoomIdentity } from 'd3-zoom';
import { HALF_PI, Viewport, geoZoomToScale, numClamp, vecAdd, vecInterp, vecSubtract } from '@rapid-sdk/math';

import { PixiLayerBackgroundTiles } from '../pixi/PixiLayerBackgroundTiles.js';

const MIN_Z = 0.5;
const MAX_Z = 24;
const MIN_K = geoZoomToScale(MIN_Z);
const MAX_K = geoZoomToScale(MAX_Z);


/**
 * UiMapInMap
 */
export class UiMapInMap {

  /**
   * @constructor
   * @param  `conttext`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this.viewMini = new Viewport();
    this.stage = null;          // PIXI.Container() that lives at the root of this scene
    this.layer = null;          // Background Tile layer for the minimap

    this._isHidden = true;      // start out hidden
    this._skipEvents = false;
    this._gesture = null;
    this._zDiff = 5;            // by default, minimap renders at (main zoom - 5)
    this._tStart = null;        // if mid-gesture, transform at start of gesture
    this._initPromise = null;

    // D3 selections
    this.$parent = null;
    this.$supersurface = null;
    this.$surface = null;
    this.$wrap = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.toggle = this.toggle.bind(this);
    this.drawMinimap = this.drawMinimap.bind(this);
    this._tick = this._tick.bind(this);
    this._zoomStarted = this._zoomStarted.bind(this);
    this._zoomed = this._zoomed.bind(this);
    this._zoomEnded = this._zoomEnded.bind(this);

    // d3-zoom behavior
    this._zoom = d3_zoom()
      .scaleExtent([MIN_K, MAX_K])
      .on('start', this._zoomStarted)
      .on('zoom', this._zoomed)
      .on('end', this._zoomEnded);
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders)
   * @param {d3-selection} $parent - A d3-selection to a HTMLEement that this component should render itself into
   */
  render($parent = this.$parent) {
    if ($parent) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    // add .map-in-map
    let $wrap = $parent.selectAll('.map-in-map')
      .data([0]);

    const $$wrap = $wrap.enter()
      .append('div')
      .attr('class', 'map-in-map');

    this.$wrap = $wrap = $wrap.merge($$wrap)
      .style('display', this._isHidden ? 'none' : 'block');


    // add .supersurface
    let $supersurface = $wrap.selectAll('.supersurface')
      .data([0]);

    const $$supersurface = $supersurface.enter()
      .append('div')
      .attr('class', 'supersurface')
      .call(this._zoom)
      .on('dblclick.zoom', null);

    this.$supersurface = $supersurface = $supersurface.merge($$supersurface);


    // add .surface
    let $surface = $supersurface.selectAll('.surface')
      .data([0]);

    const $$surface = $surface.enter()
      .append('canvas')
      .attr('class', 'surface');

    this.$surface = $surface = $surface.merge($$surface);

    // hardcoded dimensions for now
    const [w, h] = [200, 150];
    this.viewMini.dimensions = [w * 2, h * 2];
    $surface
      .style('width', `${w}px`)
      .style('height', `${h}px`)
      .attr('width', w * 2)
      .attr('height', h * 2);

    this.initAsync()
      .then(() => this.drawMinimap());
  }


  /**
   * drawMinimap
   * Call this whenever something about the minimap needs to change
   */
  drawMinimap() {
    if (this._isHidden) return;

    const map = this.context.systems.map;
    const renderer = map.renderer;
    if (!renderer?.pixi || !renderer?.textures?.loaded) return;  // called too early?

    this._updateTransform();
    this._updateBoundingBox();
    this._tick();
  }


  /**
   * _zoomEnded
   * d3-zoom callback for when a zoom/pan starts
   */
  _zoomStarted() {
    if (this._skipEvents) return;

    const t = this.viewMini.transform.props;
    this._tStart = d3_zoomIdentity.translate(t.x, t.y).scale(t.k);
    this._gesture = null;
  }


  /**
   * _zoomed
   * d3-zoom callback that receives zoom/pan events
   * @param  d3_event   A d3-zoom event, transform contains details about what changed
   */
  _zoomed(d3_event) {
    if (this._skipEvents) return;

    const {x, y, k} = d3_event.transform;

    if (!this._gesture) {
      this._gesture = (k !== this._tStart.k) ? 'zoom' : 'pan';
    }

    const viewMain = this.context.viewport;
    const viewMini = this.viewMini;

    // Remove translations from zooms - all zooms should occur at the minimap center.
    if (this._gesture === 'zoom') {
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
    this._zDiff = viewMain.transform.zoom - viewMini.transform.zoom;

    this.drawMinimap();
  }


  /**
   * _zoomEnded
   * d3-zoom callback for when the zoom/pan ends
   */
  _zoomEnded() {
    if (this._skipEvents) return;

    if (this._gesture === 'pan') {
      const map = this.context.systems.map;
      map.center(this.viewMini.centerLoc());  // recenter main map..
    }

    this._tStart = null;
    this._gesture = null;

    this.drawMinimap();
  }


  /**
   * _updateTransform
   * Update the minimap viewport and d3-zoom transform
   */
  _updateTransform() {
    // If mini map is changing, skip..
    // The transform was already set in `_zoomed`
    if (this._tStart) return;

    const viewMain = this.context.viewport;
    const viewMini = this.viewMini;

    const loc = viewMain.centerLoc();
    const tMain = viewMain.transform.props;
    const zMain = viewMain.transform.zoom;
    const zMini = numClamp(zMain - this._zDiff, MIN_Z, MAX_Z);
    const kMini = geoZoomToScale(zMini);
    const cMini = viewMini.center();

    // center of stage at map center?
    this.stage.position.set(0, 0);

    // Update minimap transform
    viewMini.transform = { x: tMain.x, y: tMain.y, k: kMini };
    let xy = viewMini.transform.translation;
    const point = viewMini.project(loc);
    const delta = vecSubtract(cMini, point);
    xy = vecAdd(xy, delta);
    viewMini.transform = { x: xy[0], y: xy[1], k: kMini };

    // update d3-zoom transform
    const zoom = this._zoom;
    this._skipEvents = true;
    zoom.scaleExtent([MIN_K, geoZoomToScale(zMain - 3)]);
    this.$supersurface.call(zoom.transform, d3_zoomIdentity.translate(xy[0], xy[1]).scale(kMini));
    this._skipEvents = false;
  }


  /**
   * _updateBoundingBox
   * Recalculates the position and size of the bounding box rectangle on the minimap
   */
  _updateBoundingBox() {
    if (this._isHidden) return;

    const context = this.context;
    const map = context.systems.map;
    const renderer = map.renderer;
    const textures = renderer?.textures;
    const pixi = renderer?.pixi;
    if (!pixi || !textures?.loaded) return;  // called too early?

    const stage = this.stage;
    const viewMain = context.viewport;
    const viewMini = this.viewMini;

    const [w, h] = viewMain.dimensions;
    const mainPoints = [[0, 0], [0, h], [w, h], [w, 0], [0, 0]];
    const miniPoints = new Array(mainPoints.length);
    const flatPoints = new Array(mainPoints.length * 2);  // as a flattened array

    // If user is currently panning, keep the bbox in the center
    // so they can see where the map will translate to.
    let offset = [0, 0];
    const tStart = this._tStart;
    const tCurr = viewMini.transform.props;
    if (tStart && tStart.k === tCurr.k) {   // `k` unchanged, so user is not zooming
      offset = [tCurr.x - tStart.x, tCurr.y - tStart.y];
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

    let bbox = stage.getChildByLabel('bbox');
    if (!bbox) {
      bbox = new PIXI.Graphics();
      bbox.label = 'bbox';
      bbox.eventMode = 'none';
      stage.addChild(bbox);
    }

    let arrow = stage.getChildByLabel('arrow');
    if (!arrow) {
      arrow = new PIXI.Container();
      arrow.label = 'arrow';
      arrow.eventMode = 'none';
      stage.addChild(arrow);

      // We're repurposing the 'sided' arrow, so we need to turn it -90°
      const sprite = new PIXI.Sprite();
      sprite.texture = textures.get('sided');
      sprite.tint = 0xffff00;
      sprite.anchor.set(0, 0.5); // left, middle
      sprite.scale.set(2, 2);
      sprite.rotation = -HALF_PI;
      arrow.addChild(sprite);
    }

    bbox
      .clear()
      .poly(flatPoints)
      .stroke({ color: 0xffff00, width: 3 });

    // Place an "up" arrow at the "top" of the box.
    const [arrowX, arrowY] = vecInterp(miniPoints[3], miniPoints[4], 0.5);
    arrow.position.set(arrowX, arrowY);
    arrow.rotation = -viewMain.transform.rotation;
  }


  /**
   * toggle
   * Toggles the minimap on/off
   * @param  {Event}  d3 keypress event that triggered the toggle (if any)
   */
  toggle(d3_event) {
    if (d3_event) d3_event.preventDefault();

    const context = this.context;
    const $wrap = this.$wrap;
    if (!$wrap) return;   // called too early?

    this._isHidden = !this._isHidden;

    context
      .container()
      .select('.minimap-toggle-item')
      .classed('active', !this._isHidden)
      .select('input')
      .property('checked', !this._isHidden);

    if (this._isHidden) {
      $wrap
        .transition()
        .duration(200)
        .style('opacity', '0')
        .on('end', () => {
          $wrap.style('display', 'none');
          this._clear();
        });

    } else {
      this.drawMinimap();
      $wrap
        .style('display', 'block')
        .style('opacity', '0')
        .transition()
        .duration(200)
        .style('opacity', '1');
    }
  }


  /**
   * _clear
   * Removes resources used by the minimap when it goes invisible
   */
  _clear() {
    if (this.layer) {
      this.layer.destroyAll();
    }
  }


  /**
   * _tick
   * Draw the minimap
   */
  _tick() {
    if (this._isHidden) return;

    const context = this.context;
    const map = context.systems.map;
    const renderer = map.renderer;
    const pixi = renderer?.pixi;
    if (!pixi || !renderer?.textures?.loaded) return;  // called too early?

    window.performance.mark('minimap-start');

    const frame = 0;    // not used
    this.layer.render(frame, this.viewMini);   // APP

    pixi.renderer.render({    // DRAW
      container: this.stage,
      target: this.$surface.node()
    });

    window.performance.mark('minimap-end');
    window.performance.measure('minimap', 'minimap-start', 'minimap-end');
  }


  /**
   * initAsync
   * Setup the Pixi environment for the minimap
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    if (this._initPromise) return this._initPromise;

    if (!this.$supersurface || !this.$surface)  return Promise.reject();  // called too early?

    const context = this.context;
    const l10n = context.systems.l10n;
    const map = context.systems.map;

    // Use the same Pixi Application that the main map uses.
    // As of Pixi v8, we can not create multiple Pixi Applications.
    // Instead, a single application can render to multiple canvases.
    const renderer = map.renderer;
    const pixi = renderer.pixi;
    if (!pixi || !renderer?.textures)  return Promise.reject();  // called too early?

    // event handlers
    const key = l10n.t('background.minimap.key');
    context.keybinding().on(key, this.toggle);
    map.on('draw', this.drawMinimap);

    // Mock Stage
    const stage = new PIXI.Container();
    stage.label = 'mini-stage';
    stage.sortableChildren = false;
    stage.eventMode = 'none';
    this.stage = stage;

    // Mock Renderer
    const miniRenderer = {
      context: context,
      supersurface: this.$supersurface,
      surface: this.$surface,
      pixi: pixi,
      stage: stage,
      origin: stage,
      textures: renderer.textures
    };

    // Mock Scene
    const miniScene = {
      context: context,
      renderer: miniRenderer,
      groups: new Map(),
      layers: new Map(),
      features: new Map()
    };

    // Mock Group Container
    const groupContainer = new PIXI.Container();
    groupContainer.label = 'background';
    stage.addChild(groupContainer);
    miniScene.groups.set('background', groupContainer);

    // Layer
    this.layer = new PixiLayerBackgroundTiles(miniScene, 'minimap-background', true);  // isMinimap = true
    miniScene.layers.set(this.layer.id, this.layer);

    return this._initPromise = Promise.resolve();
  }

}
