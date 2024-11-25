import * as PIXI from 'pixi.js';
import { geoMetersToLon, vecEqual } from '@rapid-sdk/math';

import { AbstractLayer } from './AbstractLayer.js';
import { DashLine } from './lib/DashLine.js';


/**
 * PixiLayerMapUI
 * This class contains any UI elements to be 'drawn over' the map.
 * Some of these containers will contain data managed by other layers.
 *
 * - selected / hovered vertices and other elements
 * - geolocation aura
 * - tile debugging grid
 * - lasso selection polygon
 * - others?
 *
 * @class
 */
export class PixiLayerMapUI extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);
    this.enabled = true;   // this layer should always be enabled

    this._oldk = 0;

    // setup the child containers
    // these only go visible if they have something to show

    // GEOLOCATION
    this._geolocationData = null;
    this._geolocationDirty = false;
    const geolocation = new PIXI.Container();
    geolocation.label= 'geolocation';
    geolocation.eventMode = 'none';
    geolocation.sortableChildren = false;
    geolocation.visible = false;
    this.geolocation = geolocation;

    // TILE DEBUGGING
    const tileDebug = new PIXI.Container();
    tileDebug.label= 'tile-debug';
    tileDebug.eventMode = 'none';
    tileDebug.sortableChildren = false;
    tileDebug.visible = false;
    this.tileDebug = tileDebug;

    // SELECTED
    const selected = new PIXI.Container();
    selected.label = 'selected';
    selected.sortableChildren = true;
    selected.visible = true;
    this.selected = selected;

    // HALO
    const halo = new PIXI.Container();
    halo.label = 'halo';
    halo.sortableChildren = true;
    halo.visible = true;
    this.halo = halo;

    // Lasso polygon
    this._lassoData = null;
    this._lassoDirty = false;
    this._lassoLine = new PIXI.Graphics();
    this._lassoFill = new PIXI.Graphics();
    const lasso = new PIXI.Container();
    lasso.label= 'lasso';
    lasso.eventMode = 'none';
    lasso.sortableChildren = false;
    lasso.visible = false;
    this.lasso = lasso;

    const groupContainer = this.scene.groups.get('ui');
    groupContainer.addChild(geolocation, tileDebug, selected, halo, lasso);
  }


  /**
   * reset
   * Every Layer should have a reset function to clear out any state when a reset occurs.
   */
  reset() {
    super.reset();
    this._lassoData = null;
    this.lasso.removeChildren();
  }


  /**
   * enabled
   * This layer should always be enabled - it contains important UI stuff
   */
  get enabled() {
    return true;
  }
  set enabled(val) {
    this._enabled = true;
  }


  /**
   * geolocationData
   * see:  https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPosition
   */
  get geolocationData() {
    return this._geolocationData;
  }
  set geolocationData(val) {
    this._geolocationData = val;
    this._geolocationDirty = true;
  }


  /**
   * lassoData
   * Pass an array of coordinate data that grows at the user draws the lasso
   */
  get lassoData() {
    return this._lassoData;
  }
  set lassoData(val) {
    this._lassoData = val;
    this._lassoDirty = true;
  }


  /**
   * render
   * Render any of the child containers for UI that should float over the map.
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   */
  render(frame, viewport) {
    // redraw if zoom changes
    const k = viewport.transform.scale;
    if (k !== this._oldk) {
      this._geolocationDirty = true;
      this._lassoDirty = true;
      this._oldk = k;
    }

    if (this._geolocationDirty) {
      this.renderGeolocation(frame, viewport);
    }

    if (this._lassoDirty) {
      this.renderLasso(frame, viewport);
    }

  }

  /**
   * renderLasso
   * Render the lasso polygon
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   */
  renderLasso(frame, viewport) {
    if (!this._lassoDirty) return;

    const container = this.lasso;
    const line = this._lassoLine;
    const fill = this._lassoFill;
    const data = this._lassoData;

    if (Array.isArray(data) && data.length > 1) {  // should show lasso
      container.visible = true;
      if (!container.children.length) {
        container.addChild(line, fill);
      }

      // Make sure the lasso is closed
      const coords = data.slice();  // shallow copy
      const start = coords.at(0);
      const end = coords.at(-1);
      if (!vecEqual(start, end)) {
        coords.push(start);
      }

      const flatCoords = coords.map(coord => viewport.project(coord)).flat();

      // line
      const lineStyle = { alpha: 0.7, dash: [6, 3], width: 1, color: 0xffffff };
      line.clear();
      new DashLine(line, lineStyle).poly(flatCoords);

      // fill
      const fillStyle = { alpha: 0.5, color: 0xaaaaaa };
      fill.clear().poly(flatCoords).fill(fillStyle);

    } else {  // no lasso data
      container.visible = false;
      if (container.children.length) {
        container.removeChildren();
      }
    }

    this._lassoDirty = false;
  }


  /**
   * renderGeolocation
   * Render the geoloation data
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   */
  renderGeolocation(frame, viewport) {
    if (!this._geolocationDirty) return;

    const container = this.geolocation;

    container.removeChildren();

    if (this.geolocationData && this.geolocationData.coords) {
      container.visible = true;

      const d = this.geolocationData.coords;
      const coord = [d.longitude, d.latitude];
      const [x, y] = viewport.project(coord);

      // Calculate the radius of the accuracy aura (convert meters -> pixels)
      const dLon = geoMetersToLon(d.accuracy, coord[1]);  // coord[1] = at this latitude
      const edge = [d.longitude + dLon, d.latitude];
      const x2 = viewport.project(edge)[0];
      const r = Math.max(Math.abs(x2 - x), 15);
      const BLUE = 0xe60ff;

      const aura = new PIXI.Graphics()
        .circle(x, y, r)
        .fill({ color: BLUE, alpha: 0.4 });
      aura.label = 'aura';
      container.addChild(aura);

      // Show a viewfield for the heading if we have it
      if (d.heading !== null && !isNaN(d.heading)) {
        const textures = this.gfx.textures;
        const heading = new PIXI.Sprite(textures.get('viewfieldDark'));
        heading.anchor.set(0.5, 1);  // middle, top
        heading.angle = d.heading;
        heading.label = 'heading';
        heading.position.set(x, y);
        container.addChild(heading);
      }

      const position = new PIXI.Graphics()
        .circle(x, y, 6.5)
        .stroke(1.5, 0xffffff, 1.0)
        .fill({ color: BLUE, alpha: 1.0 });
      position.label = 'position';
      container.addChild(position);

    } else {
      container.visible = false;
    }

    this._geolocationDirty = false;

  }

}
