import * as PIXI from 'pixi.js';
import { interpolateNumber as d3_interpolateNumber } from 'd3-interpolate';
import { AdjustmentFilter, ConvolutionFilter } from 'pixi-filters';
import { Tiler, geoScaleToZoom, vecScale } from '@rapid-sdk/math';

import { AbstractLayer } from './AbstractLayer.js';

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
   * @param  layerID    Unique string to use for the name of this Layer
   * @param  isMinimap  Pass `true` if this layer should be attached to the minimap
   */
  constructor(scene, layerID, isMinimap) {
    super(scene, layerID);
    this.enabled = true;   // background imagery should be enabled by default
    this.isMinimap = isMinimap;

    // Items in this layer don't need to be interactive
    const groupContainer = this.scene.groups.get('background');
    groupContainer.eventMode = 'none';

    this.filters = {
      brightness: 1,
      contrast: 1,
      saturation: 1,
      sharpness: 1,
    };

    this._tileMaps = new Map();    // Map (sourceID -> Map(tileID -> tile))
    this._failed = new Set();      // Set of failed tileURLs
    this._tiler = new Tiler();
  }


  /**
   * reset
   * Every Layer should have a reset function to clear out any state when a reset occurs.
   */
  reset() {
    super.reset();
    this.destroyAll();
    this._tileMaps.clear();
    this._failed.clear();
  }


  /**
   * render
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   */
  render(frame, viewport) {
    const imagery = this.context.systems.imagery;
    const groupContainer = this.scene.groups.get('background');

    // Collect tile sources - baselayer and overlays
    const showSources = new Map();   // Map (sourceID -> source)

    const base = imagery.baseLayerSource();
    const baseID = base?.key;   // note: use `key` here - for Wayback it will include the date
    if (base && baseID !== 'none') {
      showSources.set(baseID, base);
    }

    for (const overlay of imagery.overlayLayerSources()) {
      showSources.set(overlay.id, overlay);
    }

    // Render each tile source (iterates in insertion order, base then overlays)
    let index = 0;
    for (const [sourceID, source] of showSources) {
      const sourceContainer = this.getSourceContainer(sourceID);
      sourceContainer.zIndex = (source.isLocatorOverlay() ? 999 : index++);

      // If this is the base tile layer (and not minimap) apply the filters to it.
      if (!this.isMinimap && source === base) {
        this.applyFilters(sourceContainer);
      }

      let tileMap = this._tileMaps.get(sourceID);
      if (!tileMap) {
        tileMap = new Map();   // Map (tileID -> Tile)
        this._tileMaps.set(sourceID, tileMap);
      }

      const timestamp = window.performance.now();
      this.renderSource(timestamp, viewport, source, sourceContainer, tileMap);
    }

    // Remove any sourceContainers and data not needed anymore
    // Doing this in 2 passes to avoid affecting `.children` while iterating over it.
    const toDestroy = new Set();
    for (const sourceContainer of groupContainer.children) {
      const sourceID = sourceContainer.name;
      if (!showSources.has(sourceID)) {
        toDestroy.add(sourceID);
      }
    }

    for (const sourceID of toDestroy) {
      this.destroySource(sourceID);
    }
  }


  /**
   * renderSource
   * @param timestamp        Timestamp in milliseconds
   * @param viewport         Pixi viewport to use for rendering
   * @param source           Imagery tile source Object
   * @param sourceContainer  PIXI.Container to render the tiles to
   * @param tileMap          Map(tile.id -> Tile) for this tile source
   */
  renderSource(timestamp, viewport, source, sourceContainer, tileMap) {
    const context = this.context;
    const textureManager = this.renderer.textures;
    const osm = context.services.osm;
    const t = viewport.transform.props;
    const sourceID = source.key;   // note: use `key` here, for Wayback it will include the date

    // Defensive coding in case nominatim/other reasons cause us to get an invalid view transform.
    if (isNaN(t.x) || isNaN(t.y)) {
      return;
    }

    // The tile debug container lives on the `map-ui` layer so it is drawn over everything
    let showDebug = false;
    let debugContainer;
    if (!this.isMinimap) {
      showDebug = context.getDebug('tile');
      const mapUIContainer = this.scene.layers.get('map-ui').container;
      debugContainer = mapUIContainer.getChildByName('tile-debug');
      debugContainer.visible = showDebug;
    }

    const tileSize = source.tileSize || 256;
    const z = geoScaleToZoom(t.k, tileSize);  // Use actual zoom for this, not effective zoom

    // Apply imagery offset (in pixels) to the source container
    const offset = vecScale(source.offset, Math.pow(2, z));
    sourceContainer.position.set(offset[0], offset[1]);

    // Determine tiles needed to cover the view at the zoom we want,
    // including any zoomed out tiles if this field contains any holes
    const needTiles = new Map();                // Map(tileID -> tile)
    const maxZoom = Math.ceil(z);               // the zoom we want (round up for sharper imagery)
    const minZoom = Math.max(0, maxZoom - source.zoomRange);   // the mininimum zoom we'll accept

    let covered = false;
    for (let tryZoom = maxZoom; !covered && tryZoom >= minZoom; tryZoom--) {
      if (!source.validZoom(tryZoom)) continue;  // not valid here, zoom out
      if (source.isLocatorOverlay() && maxZoom > 17) continue;   // overlay is blurry if zoomed in this far

      const result = this._tiler
        .skipNullIsland(!!source.overlay)
        .zoomRange(tryZoom)
        .getTiles(this.isMinimap ? viewport : context.viewport);  // minimap passes in its own viewport

      let hasHoles = false;
      for (const tile of result.tiles) {
        // skip locator overlay tiles where we have osm data loaded there
        if (!this.isMinimap && tryZoom >= 10 && osm && source.isLocatorOverlay()) {
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
    for (const [tileID, tile] of needTiles) {
      if (tileMap.has(tileID)) continue;   // we made it already

      const tileName = `${sourceID}-${tileID}`;
      const sprite = new PIXI.Sprite();
      sprite.name = tileName;
      sprite.anchor.set(0, 1);    // left, bottom
      sprite.zIndex = tile.xyz[2];   // draw zoomed tiles above unzoomed tiles
      sprite.alpha = source.alpha;
      sourceContainer.addChild(sprite);
      tile.sprite = sprite;
      tileMap.set(tileID, tile);

      // Start loading the image
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = tile.url;
      tile.image = image;
      tile.loaded = false;

      // After the image loads, allocate space for it in the texture atlas
      image.onload = () => {
        this._failed.delete(tile.url);
        if (!tile.sprite || !tile.image) return;  // it's possible that the tile isn't needed anymore and got pruned

        const w = tile.image.naturalWidth;
        const h = tile.image.naturalHeight;
        tile.sprite.texture = textureManager.allocate('tile', tile.sprite.name, w, h, tile.image);

        tile.loaded = true;
        tile.image = null;  // image is copied to the atlas, we can free it
        context.systems.map.deferredRedraw();
      };

      image.onerror = () => {
        tile.image = null;
        this._failed.add(tile.url);
        context.systems.map.deferredRedraw();
      };
    }


    // Update or remove the existing tiles
    for (const [tileID, tile] of tileMap) {
      let keepTile = false;

      // Keep this tile if it is in the `needTiles` map.
      if (needTiles.has(tileID)) {
        keepTile = true;
        tile.timestamp = timestamp;

      // Keep base (not overlay) tiles around a little while longer,
      // so they can stand in for a needed tile that has not loaded yet.
      } else if (!source.overlay) {
        keepTile = (timestamp - tile.timestamp < 3000);  // 3 sec
      }

      if (keepTile) {   // Tile may be visible - update position and scale
        const [x, y] = viewport.project(tile.wgs84Extent.min);   // left, bottom
        tile.sprite.position.set(x, y);
        const size = tileSize * Math.pow(2, z - tile.xyz[2]);
        tile.sprite.width = size;
        tile.sprite.height = size;

        if (showDebug && debugContainer && !source.overlay) {
          // Display debug tile info
          if (!tile.debug) {
            tile.debug = new PIXI.Graphics();
            tile.debug.name = `debug-${tileID}`;
            tile.debug.eventMode = 'none';
            tile.debug.sortableChildren = false;
            debugContainer.addChild(tile.debug);

            const label = new PIXI.BitmapText(tileID, { fontName: 'debug' });
            label.name = `label-${tileID}`;
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
        tileMap.delete(tileID);
      }
    }

  }


  /**
   * destroyAll
   * Frees all the resources used by all sources
   */
  destroyAll() {
    const groupContainer = this.scene.groups.get('background');

    // Doing this in 2 passes to avoid affecting `.children` while iterating over it.
    const toDestroy = new Set();
    for (const sourceContainer of groupContainer.children) {
      const sourceID = sourceContainer.name;
      toDestroy.add(sourceID);
    }

    for (const sourceID of toDestroy) {
      this.destroySource(sourceID);
    }
  }


  /**
   * destroySource
   * Frees all the resources used by a source
   * @param  sourceID
   */
  destroySource(sourceID) {
    const tileMap = this._tileMaps.get(sourceID);
    for (const [tileID, tile] of tileMap) {
      this.destroyTile(tile);
      tileMap.delete(tileID);
    }
    this._tileMaps.delete(sourceID);

    const groupContainer = this.scene.groups.get('background');
    let sourceContainer = groupContainer.getChildByName(sourceID);
    if (sourceContainer) {
      sourceContainer.destroy({ children: true });
    }
  }


  /**
   * destroyTile
   * Frees all the resources used by a tile
   * @param  tile  Tile object
   */
  destroyTile(tile) {
    const textureManager = this.renderer.textures;

    if (tile.sprite) {
      tile.sprite.texture = null;
      if (tile.loaded) {
        textureManager.free('tile', tile.sprite.name);
      }
      tile.sprite.destroy({ children: true, texture: false, baseTexture: false });
    }

    if (tile.debug) {
      tile.debug.destroy({ children: true });
    }

    tile.image = null;
    tile.sprite = null;
    tile.debug = null;
  }


  /**
   * getSourceContainer
   * Gets a PIXI.Container to hold the tiles for the given sourceID, creating one if needed
   * @param   sourceID
   * @return  a PIXI.Container
   */
  getSourceContainer(sourceID) {
    const groupContainer = this.scene.groups.get('background');
    let sourceContainer = groupContainer.getChildByName(sourceID);
    if (!sourceContainer) {
      sourceContainer = new PIXI.Container();
      sourceContainer.name = sourceID;
      sourceContainer.eventMode = 'none';
      sourceContainer.sortableChildren = true;
      groupContainer.addChild(sourceContainer);
    }
    return sourceContainer;
  }


  /**
   * applyFilters
   * Adds an adjustment filter for brightness/contrast/saturation and
   * a sharpen/blur filter, depending on the UI slider settings.
   * @param  sourceContainer   PIXI.Container that contains the tiles
   */
  applyFilters(sourceContainer) {
    const adjustmentFilter = new AdjustmentFilter({
      brightness: this.filters.brightness,
      contrast: this.filters.contrast,
      saturation: this.filters.saturation,
    });

    sourceContainer.filters = [adjustmentFilter];

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
      sourceContainer.filters.push(this.convolutionFilter);

    } else if (this.filters.sharpness < 1) {
      const blurFactor = d3_interpolateNumber(1, 8)(1 - this.filters.sharpness);
      this.blurFilter = new PIXI.filters.BlurFilter(blurFactor, 4);
      sourceContainer.filters.push(this.blurFilter);
    }
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
