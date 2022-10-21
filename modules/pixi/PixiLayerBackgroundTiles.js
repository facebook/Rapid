import * as PIXI from 'pixi.js';
import { interpolateNumber as d3_interpolateNumber } from 'd3-interpolate';
import { AtlasAllocator } from 'texture-allocator';
import { AdjustmentFilter } from '@pixi/filter-adjustment';
import { ConvolutionFilter } from '@pixi/filter-convolution';
import { Tiler, geoScaleToZoom, vecScale } from '@id-sdk/math';

import { AbstractLayer } from './AbstractLayer';

const LAYERID = 'background';
const DEBUGCOLOR = 0xffff00;

// scalars for use by the convolution filter to sharpen the imagery
const sharpenMatrix = [
     0,      -0.0125,      0,
  -0.0125,    0.5,      -0.0125,
     0,      -0.0125,      0
];


/**
 * PixiLayerBackgroundTiles
 * @class
 */
export class PixiLayerBackgroundTiles extends AbstractLayer {

  /**
   * @constructor
   * @param  scene      The Scene that owns this Layer
   * @param  layerZ     z-index to assign to this Layer's container
   * @param  isMinimap  Pass `true` if this layer should be attached to the minimap
   */
  constructor(scene, layerZ, isMinimap) {
    if (isMinimap) {
      super(scene, `minimap-${LAYERID}`, layerZ);
    } else {
      super(scene, LAYERID, layerZ);
    }
    this.enabled = true;   // background imagery should be enabled by default
    this.isMinimap = isMinimap;

    // items in this layer don't need to be interactive
    this.container.buttonMode = false;
    this.container.interactive = false;
    this.container.interactiveChildren = false;
    this.filters = {
      brightness: 1,
      contrast: 1,
      saturation: 1,
      sharpness: 1,
    };

    this._atlasAllocator = new AtlasAllocator();
    this._tileMaps = new Map();    // Map (sourceID -> Map(tile.id -> Tile))
    this._failed = new Set();      // Set of failed tileURLs
    this._tiler = new Tiler();
  }


  /**
   * applyFilters
   * Adds an adjustment filter for brightness/contrast/saturation and
   * a sharpen/blur filter, depending on the UI slider settings.
   */
  applyFilters() {
    this.adjustmentFilter = new AdjustmentFilter({
      brightness: this.filters.brightness,
      contrast: this.filters.contrast,
      saturation: this.filters.saturation,
    });

    this.container.filters = [this.adjustmentFilter];

    if (this.filters.sharpness > 1) {
      // The convolution filter consists of adjacent pixels with a negative factor and the central pixel being at least one.
      // The central pixel (at index 4 of our 3x3 array) starts at 1 and increases
      const convolutionArray = sharpenMatrix.map((n, i) => {
        if (i === 4) {
          const interp = d3_interpolateNumber(1, 2)(this.filters.sharpness);
          const result = n * interp;
          return result;
        } else {
          return n;
        }
      });

      this.convolutionFilter = new ConvolutionFilter(convolutionArray);
      this.container.filters.push(this.convolutionFilter);

    } else if (this.filters.sharpness < 1) {
      const blurFactor = d3_interpolateNumber(1, 8)(1 - this.filters.sharpness);
      this.blurFilter = new PIXI.filters.BlurFilter(blurFactor, 4);
      this.container.filters.push(this.blurFilter);
    }
  }


  /**
   * render
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   */
  render(frame, projection) {
    const imagery = this.context.imagery();

    if (!this.isMinimap) {
      this.applyFilters();
    }

    // Collect tile sources - baselayer and overlays
    let tileSources = new Map();   // Map (tilesource Object -> zIndex)
    let tileSourceIDs = new Set();
    const base = imagery.baseLayerSource();
    if (base && base.id !== 'none') {
      tileSources.set(base, -1);
      tileSourceIDs.add(base.id);
    }

    imagery.overlayLayerSources().forEach((overlay, index) => {
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

      const timestamp = window.performance.now();
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

      let tileMap = this._tileMaps.get(sourceID);
      tileMap.forEach(tile => {
        this.destroyTile(tile);
        tileMap.delete(tile.id);
      });

      this._tileMaps.delete(sourceID);

      sourceContainer.destroy({ children: true });
    });
  }


  /**
   * renderTileSource
   * @param timestamp          Timestamp in milliseconds
   * @param projection         Pixi projection to use for rendering
   * @param source             Imagery tile source Object
   * @param sourcecontainer    Pixi container to render the tiles to
   * @param tileMap            Map(tile.id -> Tile) for this tile source
   */
  renderTileSource(timestamp, projection, source, sourceContainer, tileMap) {
    const context = this.context;
    const pixi = this.renderer.pixi;
    const osm = context.connection();

    // The tile debug container lives on the `map-ui` layer so it is drawn over everything
    const SHOWDEBUG = context.getDebug('tile');
    const mapUIContainer = context.scene().getLayer('map-ui').container;
    const debugContainer = mapUIContainer.getChildByName('tile-debug');
    debugContainer.visible = SHOWDEBUG;

    const tileSize = source.tileSize || 256;
    const k = projection.scale();
    const z = geoScaleToZoom(k, tileSize);  // Use actual zoom for this, not effective zoom

    // Apply imagery offset (in pixels) to the source container
    const offset = vecScale(source.offset, Math.pow(2, z));
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
        .getTiles(this.isMinimap ? projection : context.projection);  // minimap passes in its own projection

      let hasHoles = false;
      for (let i = 0; i < result.tiles.length; i++) {
        const tile = result.tiles[i];

        // skip locator overlay tiles where we have osm data loaded there
        if (tryZoom >= 10 && osm && source.id === 'mapbox_locator_overlay') {
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

      const tileName = `${source.id}-${tile.id}`;
      const sprite = new PIXI.Sprite();
      sprite.name = tileName;
      sprite.anchor.set(0, 1);    // left, bottom
      sprite.zIndex = tile.xyz[2];   // draw zoomed tiles above unzoomed tiles
      sourceContainer.addChild(sprite);
      tile.sprite = sprite;
      tileMap.set(tile.id, tile);

      // Start loading the image
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = tile.url;
      tile.image = image;

      // After the image loads, allocate space for it in the texture atlas
      image.onload = () => {
        this._failed.delete(tile.url);
        if (!tile.sprite || !tile.image) return;  // it's possible that the tile isn't needed anymore and got pruned

        tile.loaded = true;
        const w = tile.image.naturalWidth;
        const h = tile.image.naturalHeight;

        let source = tile.image;
        if (pixi.renderer.context.webGLVersion === 1) {
          // Convert to ArrayBufferView of pixels when used in a WebGL1 environment - #478
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(image, 0, 0);
          source = ctx.getImageData(0, 0, w, h);
        }

        const PADDING = 0;
        const texture = this._atlasAllocator.allocate(w, h, PADDING, source);

        // Shrink texture coords by half pixel to avoid colors spilling over from adjacent tile in atlas.
        // https://gamedev.stackexchange.com/a/49585
        const rect = texture.frame.clone().pad(-0.5);
        texture.frame = rect;  // `.frame` setter will call updateUVs() automatically

        sprite.texture = texture;
        tile.image = null;
        context.map().deferredRedraw();
      };

      image.onerror = () => {
        tile.image = null;
        this._failed.add(tile.url);
        context.map().deferredRedraw();
      };

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

      if (keepTile) {   // Tile may be visible - update position and scale
        const [x, y] = projection.project(tile.wgs84Extent.min);   // left, bottom
        tile.sprite.position.set(x, y);
        const size = tileSize * Math.pow(2, z - tile.xyz[2]);
        tile.sprite.width = size;
        tile.sprite.height = size;

        if (SHOWDEBUG && !source.overlay && !this.isMinimap) {
          // Display debug tile info
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
        this.destroyTile(tile);
        tileMap.delete(tile.id);
      }
    });

  }


  /**
   * destroyTile
   * Frees all the resources used by a tile
   * @param  tile  Tile object
   */
  destroyTile(tile) {
    if (tile.sprite) {
      if (tile.sprite.texture && tile.sprite.texture !== PIXI.Texture.EMPTY) {
        this._atlasAllocator.free(tile.sprite.texture);
      }
      tile.sprite.destroy({ children: true, texture: true, baseTexture: false });
      tile.sprite = null;
      tile.image = null;
    }
    if (tile.debug) {
      tile.debug.destroy({ children: true });
      tile.debug = null;
    }
  }


  /**
   * getSourceContainer
   * @param  sourceID
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

  setBrightness(val) {
    this.filters.brightness = val;
  }

  setContrast(val) {
    this.filters.contrast = val;
  }

  setSaturation(val) {
    this.filters.saturation = val;
  }

  setSharpness(val) {
    this.filters.sharpness = val;
  }

}
