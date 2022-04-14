import * as PIXI from 'pixi.js';
import { Tiler, geoScaleToZoom, vecScale } from '@id-sdk/math';
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

    // items in this layer don't need to be interactive
    const layer = this.container;
    layer.buttonMode = false;
    layer.interactive = false;
    layer.interactiveChildren = false;

    this._tileMaps = new Map();  // Map (sourceID -> Map(tileURL -> Tile Object))
    this._failed = new Set();    // Set of failed tileURLs
    this._tiler = new Tiler();
  }


  /**
   * render
   * @param timestamp    timestamp in milliseconds
   * @param projection   pixi projection to use for rendering
   */
  render(timestamp, projection) {
    const background = this.context.background();

    // Collect tile sources - baselayer and overlays
    let tileSources = new Map();   // Map (tilesource Object -> zIndex)
    let tileSourceIDs = new Set();
    const base = background.baseLayerSource();
    if (base && base.id !== 'none') {
      tileSources.set(base, -1);
      tileSourceIDs.add(base.id);
    }
    background.overlayLayerSources().forEach((overlay, index) => {
      if (overlay.id === 'mapbox_locator_overlay') {
        index = 999;  // render the locator labels above all other overlays
      }
      tileSources.set(overlay, index);
      tileSourceIDs.add(overlay.id);
    });



    // Render each tile source
    tileSources.forEach((zIndex, source) => {
      if (!source || source.id === 'none') return;

      let tileMap = this._tileMaps.get(source.id);
      if (!tileMap) {
        tileMap = new Map();
        this._tileMaps.set(source.id, tileMap);
      }

      // Get a container for the tiles (create if needed)
      const sourceContainer = this.getSourceContainer(source.id);
      sourceContainer.zIndex = zIndex;

      this.renderTileSource(timestamp, projection, source, sourceContainer, tileMap);
    });


    // Remove any tile sources containers and data not needed anymore
    this.container.children.forEach(sourceContainer => {
      const sourceID = sourceContainer.name;
      if (!tileSourceIDs.has(sourceID)) {
        sourceContainer.destroy({ children: true, texture: true, baseTexture: true });
        this._tileMaps.delete(sourceID);
      }
    });

  }


  /**
   * renderTileSource
   * @param timestamp          timestamp in milliseconds
   * @param projection         pixi projection to use for rendering
   * @param source             imagery tile source Object
   * @param sourcecontainer    Pixi container to render the tiles to
   * @param tileMap            Map(tileURL -> Tile) for this tile source
   */
  renderTileSource(timestamp, projection, source, sourceContainer, tileMap) {
    const thiz = this;
    const context = this.context;

    const tileSize = source.tileSize || 256;
    const k = projection.scale();
    const z = geoScaleToZoom(k, tileSize);  // use actual zoom for this, not effective zoom

    // Apply imagery offset (in pixels) to the source container
    const offset = vecScale(source.offset(), Math.pow(2, z));
    sourceContainer.position.set(offset[0], offset[1]);

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
      if (tileMap.has(tileURL)) return;  // we made it already

      const sprite = new PIXI.Sprite.from(tileURL);
      sprite.name = `${source.id}-${tile.id}`;
      sprite.anchor.set(0, 1);    // left, bottom
      sprite.zIndex = tile.xyz[2];   // draw zoomed tiles above unzoomed tiles
      sourceContainer.addChild(sprite);

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
      tileMap.set(tileURL, tile);
    });

    // Update or remove the existing tiles
    tileMap.forEach((tile, tileURL) => {
      if (needTiles.has(tileURL)) {   // still want to keep this tile
        tile.timestamp = timestamp;
      }

      if (timestamp - tile.timestamp > 5000) {  // havent needed it for 5 seconds, cull from scene
        tile.sprite.destroy({ children: true, texture: true, baseTexture: true });
        tileMap.delete(tileURL);

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


  /**
   * getSourceContainer
   * @param sourceID
   */
  getSourceContainer(sourceID) {
    let sourceContainer = this.container.getChildByName(sourceID);
    if (!sourceContainer) {
      sourceContainer = new PIXI.Container();
      sourceContainer.name = sourceID;
      sourceContainer.interactive = false;
      sourceContainer.interactiveChildren = false;
      sourceContainer.sortableChildren = true;
      this.container.addChild(sourceContainer);
    }
    return sourceContainer;
  }


}

