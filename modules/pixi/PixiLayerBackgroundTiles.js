import * as PIXI from 'pixi.js';
import { Tiler, geoScaleToZoom, vecScale } from '@id-sdk/math';
import { PixiLayer } from './PixiLayer';

const LAYERID = 'background';
const DEBUGCOLOR = 0xffff00;


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
    this.container.buttonMode = false;
    this.container.interactive = false;
    this.container.interactiveChildren = false;

    this._tileMaps = new Map();  // Map (sourceID -> Map(tile.id -> Tile))
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
        index = 999;  // render locator overlay above all other overlays
      }
      tileSources.set(overlay, index);
      tileSourceIDs.add(overlay.id);
    });


    // Render each tile source
    tileSources.forEach((zIndex, source) => {
      if (!source || source.id === 'none') return;

      let tileMap = this._tileMaps.get(source.id);
      if (!tileMap) {
        tileMap = new Map();   // Map (tile.id -> Tile)
        this._tileMaps.set(source.id, tileMap);
      }

      // Get a container for the tiles (create if needed)
      const sourceContainer = this.getSourceContainer(source.id);
      sourceContainer.zIndex = zIndex;

      this.renderTileSource(timestamp, projection, source, sourceContainer, tileMap);
    });


    // Remove any tile sourceContainers and data not needed anymore (not in `tileSourceIDs`)
    // Doing this in 2 passes to avoid affecting `.children` while iterating over it.
    let toDestroy = [];
    this.container.children.forEach(sourceContainer => {
      const sourceID = sourceContainer.name;
      if (!tileSourceIDs.has(sourceID)) {
        toDestroy.push(sourceContainer);
      }
    });
    toDestroy.forEach(sourceContainer => {
      const sourceID = sourceContainer.name;
      sourceContainer.destroy({ children: true, texture: true, baseTexture: true });
      this._tileMaps.delete(sourceID);
    });
  }


  /**
   * renderTileSource
   * @param timestamp          timestamp in milliseconds
   * @param projection         pixi projection to use for rendering
   * @param source             imagery tile source Object
   * @param sourcecontainer    Pixi container to render the tiles to
   * @param tileMap            Map(tile.id -> Tile) for this tile source
   */
  renderTileSource(timestamp, projection, source, sourceContainer, tileMap) {
    const thiz = this;
    const context = this.context;
    const osm = context.connection();

    // The tile debug container lives on the `map-ui` layer so it is drawn over everything
    const SHOWDEBUG = this.context.getDebug('tile');
    const mapUIContainer = context.layers().getLayer('map-ui').container;
    const debugContainer = mapUIContainer.getChildByName('tile-debug');
    debugContainer.visible = SHOWDEBUG;

    const tileSize = source.tileSize || 256;
    const k = projection.scale();
    const z = geoScaleToZoom(k, tileSize);  // use actual zoom for this, not effective zoom

    // Apply imagery offset (in pixels) to the source container
    const offset = vecScale(source.offset(), Math.pow(2, z));
    sourceContainer.position.set(offset[0], offset[1]);

    // Determine tiles needed to cover the view at the zoom we want,
    // including any zoomed out tiles if this field contains any holes
    let needTiles = new Map();                  // Map(tile.id -> tile)
    let maxZoom = Math.round(z);                // the zoom we want
    let minZoom = Math.max(0, maxZoom - 5);     // the mininimum zoom we'll accept
    if (!source.overzoom) {
      maxZoom = minZoom = Math.floor(z);        // try no zooms outside the one we're at
    }

    let covered = false;
    for (let tryZoom = maxZoom; !covered && tryZoom >= minZoom; tryZoom--) {
      if (!source.validZoom(tryZoom)) continue;  // not valid here, zoom out

      const result = this._tiler
        .skipNullIsland(!!source.overlay)
        .zoomRange(tryZoom)
        .margin(2)  // prefetch some rows of offscreen tiles as well
        .getTiles(context.projection);

      let hasHoles = false;
      for (let i = 0; i < result.tiles.length; i++) {
        const tile = result.tiles[i];

        // skip locator overlay tiles where we have osm data loaded there
        if (osm && source.id === 'mapbox_locator_overlay') {
          const loc = tile.wgs84Extent.center();
          if (osm.isDataLoaded(loc)) continue;
        }

        tile.url = source.url(tile.xyz);
        if (!tile.url || this._failed.has(tile.url)) {
          hasHoles = true;   // url invalid or has failed in the past
        } else {
          needTiles.set(tile.id, tile);
        }
      }
      covered = !hasHoles;
    }


    // Create a Sprite for each tile
    needTiles.forEach(tile => {
      if (tileMap.has(tile.id)) return;   // we made it already

      const sprite = new PIXI.Sprite.from(tile.url);
      sprite.name = `${source.id}-${tile.id}`;
      sprite.anchor.set(0, 1);    // left, bottom
      sprite.zIndex = tile.xyz[2];   // draw zoomed tiles above unzoomed tiles
      sourceContainer.addChild(sprite);

      const baseTexture = sprite.texture.baseTexture;
      baseTexture
        .on('error', () => {
          thiz._failed.add(tile.url);
          thiz.context.map().deferredRedraw();
        })
        .on('loaded', () => {
          thiz._failed.delete(tile.url);
          tile.loaded = true;
          thiz.context.map().deferredRedraw();
        });

      // Workaround for "uncaught promise" errors (Pixi never catches the Promise rejection, but we can)
      const prom = baseTexture.resource && baseTexture.resource._load;
      if (prom && typeof prom.catch === 'function' ) {
        prom.catch(() => { /* ignore */ });
      }

      tile.sprite = sprite;
      tileMap.set(tile.id, tile);
    });


    // Update or remove the existing tiles
    tileMap.forEach(tile => {
      let keepTile = false;

      // Keep this tile if it is in the `needTiles` map.
      if (needTiles.has(tile.id)) {
        keepTile = true;
        tile.timestamp = timestamp;

      // Keep base (not overlay) tiles around a little while longer,
      // so they can stand in for a needed tile that has not loaded yet.
      } else if (!source.overlay) {
        keepTile = (timestamp - tile.timestamp < 3000);  // 3 sec
      }

      if (keepTile) {   // tile may be visible - update position and scale
        const [x, y] = projection.project(tile.wgs84Extent.min);   // left, bottom
        tile.sprite.position.set(x, y);
        const size = tileSize * Math.pow(2, z - tile.xyz[2]);
        tile.sprite.width = size;
        tile.sprite.height = size;

        if (SHOWDEBUG && !source.overlay) {  // display debug tile info
          if (!tile.debug) {
            tile.debug = new PIXI.Graphics();
            tile.debug.name = `debug-${tile.id}`;
            tile.debug.interactive = false;
            tile.debug.interactiveChildren = false;
            tile.debug.sortableChildren = false;
            debugContainer.addChild(tile.debug);

            const label = new PIXI.BitmapText(tile.id, { fontName: 'debug' });
            label.name = `label-${tile.id}`;
            label.tint = DEBUGCOLOR;
            label.position.set(2, 2);
            tile.debug.addChild(label);
          }

          tile.debug.position.set(x, y - size);  // left, top
          tile.debug
            .clear()
            .lineStyle(2, DEBUGCOLOR)
            .drawRect(0, 0, size, size);
        }

      } else {   // tile not needed, can destroy it
        if (tile.sprite) {
          tile.sprite.destroy({ children: true, texture: true, baseTexture: true });
          tile.sprite = null;
        }
        if (tile.debug) {
          tile.debug.destroy({ children: true });
          tile.debug = null;
        }
        tileMap.delete(tile.id);
      }
    });

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
      sourceContainer.buttonMode = false;
      sourceContainer.interactive = false;
      sourceContainer.interactiveChildren = false;
      sourceContainer.sortableChildren = true;
      this.container.addChild(sourceContainer);
    }
    return sourceContainer;
  }

}
