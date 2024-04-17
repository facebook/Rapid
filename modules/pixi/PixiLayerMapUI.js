import * as PIXI from 'pixi.js';
import { DashLine } from '@rapideditor/pixi-dashed-line';
import { geoMetersToLon } from '@rapid-sdk/math';

import { AbstractLayer } from './AbstractLayer.js';


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
container.name = layerID;
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
    geolocationContainer.name = 'geolocation';
    geolocationContainer.eventMode = 'none';
    geolocationContainer.sortableChildren = false;
    geolocationContainer.visible = false;
    this.geolocationContainer = geolocationContainer;

    // TILE DEBUGGING
    const tileDebugContainer = new PIXI.Container();
    tileDebugContainer.name = 'tile-debug';
    tileDebugContainer.eventMode = 'none';
    tileDebugContainer.sortableChildren = false;
    tileDebugContainer.visible = false;
    this.tileDebugContainer = tileDebugContainer;

    // SELECTED
    const selectedContainer = new PIXI.Container();
    selectedContainer.name = 'selected';
    selectedContainer.sortableChildren = true;
    selectedContainer.visible = true;
    this.selectedContainer = selectedContainer;

    // Lasso polygon
    this._lassoPolygonData = null;
    this._lassoPolygonDirty = false;
    this._lassoLineGraphics = new PIXI.Graphics();
    this._lassoFillGraphics = new PIXI.Graphics();
    const lassoContainer = new PIXI.Container();
    lassoContainer.name = 'lasso';
    lassoContainer.eventMode = 'none';
    lassoContainer.sortableChildren = false;
    lassoContainer.visible = true;
    lassoContainer.addChild(this._lassoLineGraphics, this._lassoFillGraphics);
    this.lassoContainer = lassoContainer;

    this.container.addChild(geolocationContainer, tileDebugContainer, selectedContainer, lassoContainer);
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
   * lassoPolygonData
   */
   get lassoPolygonData() {
    return this._lassoPolygonData;
  }
  set lassoPolygonData(val) {
    this._lassoPolygonData = val;
    this._lassoPolygonDirty = true;
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
      this._lassoPolygonDirty = true;
      this._oldk = k;
    }

    if (this._geolocationDirty) {
      this.renderGeolocation(frame, viewport);
    }

    if (this._lassoPolygonDirty) {
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
    if (this._lassoPolygonDirty) {
      this._lassoPolygonDirty = false;
    }

    const LASSO_STYLE = {
      alpha: 0.7,
      dash: [6, 3],
      width: 1,   // px
      color: 0xffffff
    };

    // Simple state machine: If there's lasso data set, ensure that the lasso graphcs are added to the container.
    // If there's no lasso data set, remove the graphics from the container and stop rendering.

    // No polygon data? remove the graphics from the container.
    if (!this._lassoPolygonData && this._lassoLineGraphics.parent) {
      this.lassoContainer.removeChildren();

    } else {
      // Otherwise, we have polygon data but no parent. Add the graphics to the lasso container.
      if (!this._lassoLineGraphics.parent) {
        this.lassoContainer.addChild(this._lassoLineGraphics);
        this.lassoContainer.addChild(this._lassoFillGraphics);
      }

      // Update polygon rendered to map UI
      this._lassoLineGraphics.clear();
      this._lassoFillGraphics.clear();

      // Render the data only as long as we have something meaningful.
      if (this._lassoPolygonData?.length > 0) {
        const projectedCoords = this._lassoPolygonData.map(coord => viewport.project(coord));
        new DashLine(this._lassoLineGraphics, LASSO_STYLE).drawPolygon(projectedCoords.flat());
        this._lassoFillGraphics.beginFill(0xaaaaaa, 0.5).drawPolygon(projectedCoords.flat()).endFill();
      }
    }
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
          .beginFill(BLUE, 0.4)
          .drawCircle(x, y, r)
          .endFill();
        locatorAura.name = 'aura';
        this.geolocationContainer.addChild(locatorAura);

        // Show a viewfield for the heading if we have it
        if (d.heading !== null && !isNaN(d.heading)) {
          const textures = this.renderer.textures;
          const locatorHeading = new PIXI.Sprite(textures.get('viewfieldDark'));
          locatorHeading.anchor.set(0.5, 1);  // middle, top
          locatorHeading.angle = d.heading;
          locatorHeading.name = 'heading';
          locatorHeading.position.set(x, y);
          this.geolocationContainer.addChild(locatorHeading);
        }

        const locatorPosition = new PIXI.Graphics()
          .lineStyle(1.5, 0xffffff, 1.0)
          .beginFill(BLUE, 1.0)
          .drawCircle(x, y, 6.5)
          .endFill();
        locatorPosition.name = 'position';
        this.geolocationContainer.addChild(locatorPosition);

        this.geolocationContainer.visible = true;

      } else {
        this.geolocationContainer.visible = false;
      }
    }
  }

}
