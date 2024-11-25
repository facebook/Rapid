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

// todo: I'm adjusting the container nesting, this will need to be revisited
const container = new PIXI.Container();
container.label= layerID;
container.sortableChildren = true;
this.container = container;

const groupContainer = this.scene.groups.get('ui');
groupContainer.addChild(container);

    this._oldk = 0;

    // setup the child containers
    // these only go visible if they have something to show

    // GEOLOCATION
    this._geolocationData = null;
    this._geolocationDirty = false;
    const geolocationContainer = new PIXI.Container();
    geolocationContainer.label= 'geolocation';
    geolocationContainer.eventMode = 'none';
    geolocationContainer.sortableChildren = false;
    geolocationContainer.visible = false;
    this.geolocationContainer = geolocationContainer;

    // TILE DEBUGGING
    const tileDebugContainer = new PIXI.Container();
    tileDebugContainer.label= 'tile-debug';
    tileDebugContainer.eventMode = 'none';
    tileDebugContainer.sortableChildren = false;
    tileDebugContainer.visible = false;
    this.tileDebugContainer = tileDebugContainer;

    // SELECTED
    const selectedContainer = new PIXI.Container();
    selectedContainer.label= 'selected';
    selectedContainer.sortableChildren = true;
    selectedContainer.visible = true;
    this.selectedContainer = selectedContainer;

    // Lasso polygon
    this._lassoData = null;
    this._lassoDirty = false;
    this._lassoLine = new PIXI.Graphics();
    this._lassoFill = new PIXI.Graphics();
    const lasso = new PIXI.Container();
    lasso.label= 'lasso';
    lasso.eventMode = 'none';
    lasso.sortableChildren = false;
    lasso.visible = true;
    this.lasso = lasso;

    this.container.addChild(geolocationContainer, tileDebugContainer, selectedContainer, lasso);
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
    if (this._geolocationDirty) {
      this._geolocationDirty = false;
      this.geolocationContainer.removeChildren();

      if (this.geolocationData && this.geolocationData.coords) {
        const d = this.geolocationData.coords;
        const coord = [d.longitude, d.latitude];
        const [x, y] = viewport.project(coord);

        // Calculate the radius of the accuracy aura (convert meters -> pixels)
        const dLon = geoMetersToLon(d.accuracy, coord[1]);  // coord[1] = at this latitude
        const edge = [d.longitude + dLon, d.latitude];
        const x2 = viewport.project(edge)[0];
        const r = Math.max(Math.abs(x2 - x), 15);
        const BLUE = 0xe60ff;

        const locatorAura = new PIXI.Graphics()
          .circle(x, y, r)
          .fill({ color: BLUE, alpha: 0.4 });
        locatorAura.label = 'aura';
        this.geolocationContainer.addChild(locatorAura);

        // Show a viewfield for the heading if we have it
        if (d.heading !== null && !isNaN(d.heading)) {
          const textures = this.gfx.textures;
          const locatorHeading = new PIXI.Sprite(textures.get('viewfieldDark'));
          locatorHeading.anchor.set(0.5, 1);  // middle, top
          locatorHeading.angle = d.heading;
          locatorHeading.label = 'heading';
          locatorHeading.position.set(x, y);
          this.geolocationContainer.addChild(locatorHeading);
        }

        const locatorPosition = new PIXI.Graphics()
          .circle(x, y, 6.5)
          .stroke(1.5, 0xffffff, 1.0)
          .fill({ color: BLUE, alpha: 1.0 });
        locatorPosition.label = 'position';
        this.geolocationContainer.addChild(locatorPosition);

        this.geolocationContainer.visible = true;

      } else {
        this.geolocationContainer.visible = false;
      }
    }
  }

}
