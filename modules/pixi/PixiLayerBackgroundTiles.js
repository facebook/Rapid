import * as PIXI from 'pixi.js';
import { Projection, Tiler, geoScaleToZoom, vecScale, vecLength } from '@id-sdk/math';
import { PixiLayer } from './PixiLayer';

const LAYERID = 'background';


/**
 * PixiLayerBackgroundTiles
 * @class
 */
export class PixiLayerBackgroundTiles extends PixiLayer {

  /**
   * @constructor
   * @param context
   * @param scene
   * @param layerZ
   */
  constructor(context, scene, layerZ) {
    super(context, LAYERID, layerZ);
    this.scene = scene;
    this.enabled = true;   // background imagery should be enabled by default

    // tiles in this layer don't actually need to be interactive
    const layer = this.container;
    layer.buttonMode = false;
    layer.interactive = false;
    layer.interactiveChildren = false;

    this._tiles = new Map();     // Map of tileURL -> Tile Object
    this._failed = new Set();    // Set of failed tileURLs
    this._tiler = new Tiler();
  }


  /**
   * render
   * @param timestamp    timestamp in milliseconds
   * @param projection   pixi projection to use for rendering
   */
  render(timestamp, projection) {
    const thiz = this;
    const context = this.context;
    const source = context.background().baseLayerSource();
    const tileSize = (source && source.tileSize) || 256;
    const k = projection.scale();
    const z = geoScaleToZoom(k, tileSize);  // use actual zoom for this, not effective zoom

    if (!source || source.id === 'none') {   // no source, just clear everything
      this._tiles.forEach(tile => tile.sprite.destroy());
      this._tiles.clear();
      this.container.position.set(0, 0);  // reset imagery offset
      return;
    }


    // Apply imagery offset (in pixels) to the layer
    const offset = vecScale(source.offset(), Math.pow(2, z));
    this.container.position.set(offset[0], offset[1]);


    // Determine tiles needed to cover the view,
    // including any zoomed out tiles if this field contains any holes
    let needTiles = new Map();
    let maxZoom = Math.round(z);                // the zoom we want
    let minZoom = Math.max(0, maxZoom - 5);     // the mininimum zoom we'll accept
    if (!source.overzoom) {
      maxZoom = minZoom = Math.floor(z);        // try no zooms outside the one we're at
    }

    let covered = false;
    for (let tryz = maxZoom; !covered && tryz >= minZoom; tryz--) {
      if (!source.validZoom(tryz)) continue;  // not valid here, zoom out

      const result = this._tiler
        .skipNullIsland(!!source.overlay)
        .zoomRange(tryz)
        .margin(2)  // prefetch offscreen tiles as well
        .getTiles(context.projection);

      let hasHoles = false;
      for (let i = 0; i < result.tiles.length; i++) {
        const tile = result.tiles[i];
        tile.url = source.url(tile.xyz);

        if (!tile.url || this._failed.has(tile.url)) {
          hasHoles = true;   // url invalid or has failed in the past
        } else {
          needTiles.set(tile.url, tile);
        }
      }
      covered = !hasHoles;
    }

    // Create a Sprite for each tile
    needTiles.forEach((tile, tileURL) => {
      if (this._tiles.has(tileURL)) return;  // we made it already

      const sprite = new PIXI.Sprite.from(tileURL);
      sprite.name = `${source.id}-${tile.id}`;
      sprite.anchor.set(0, 1);    // left, bottom
      sprite.zIndex = tile.xyz[2];   // draw zoomed tiles above unzoomed tiles
      this.container.addChild(sprite);

      const baseTexture = sprite.texture.baseTexture;
      baseTexture
        .on('error', () => error(tileURL))
        .on('loaded', () => loaded(tileURL));

      // Workaround for "uncaught promise" errors (Pixi never catches the Promise rejection, but we can)
      const prom = baseTexture.resource && baseTexture.resource._load;
      if (prom && typeof prom.catch === 'function' ) {
        prom.catch(() => { /* ignore */ });
      }

      tile.sprite = sprite;
      this._tiles.set(tileURL, tile);
    });

    // update or remove the existing tiles
    this._tiles.forEach((tile, tileURL) => {
      if (needTiles.has(tileURL)) {   // still want to keep this tile
        tile.timestamp = timestamp;
      }

      if (timestamp - tile.timestamp > 5000) {  // havent needed it for 5 seconds, cull from scene
        tile.sprite.destroy();
        this._tiles.delete(tileURL);

      } else {   // tile is visible - update position and scale
        const [x, y] = projection.project(tile.wgs84Extent.min);   // left, bottom
        tile.sprite.position.set(x, y);
        const size = tileSize * Math.pow(2, z - tile.xyz[2]);
        tile.sprite.width = size;
        tile.sprite.height = size;
      }
    });


    function loaded(tileURL) {
      thiz._failed.delete(tileURL);
      thiz.context.map().deferredRedraw();
    }

    function error(tileURL) {
      thiz._failed.add(tileURL);
      thiz.context.map().deferredRedraw();
    }

  }

}

