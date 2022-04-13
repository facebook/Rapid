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

    this._tiles = new Map();    // Map of tile.url -> Pixi Sprite
    this._failed = new Set();     // Set of failed tile urls
    this._tiler = new Tiler();
    this._oldz = 0;
  }


  /**
   * render
   * @param timestamp    timestamp in milliseconds
   * @param projection   pixi projection to use for rendering
   */
  render(timestamp, projection) {

    const context = this.context;
    const source = context.background().baseLayerSource();
    const tileSize = (source && source.tileSize) || 256;
    const k = projection.scale();
    const z = geoScaleToZoom(k, tileSize);  // use actual zoom for this, not effective zoom

    if (!source || (z !== this._oldz)) {   // reset
      this._tiles.forEach(tile => tile.sprite.destroy());
      this._tiles.clear();
      this.container.position.set(0, 0);
      this._oldz = z;
    }

    if (!source) return;

    // Apply imagery offset (pixels) to the layer
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

      tile.sprite = sprite;
      this._tiles.set(tileURL, tile);
    });

    // update or remove the existing tiles
    this._tiles.forEach((tile, tileURL) => {
      if (needTiles.has(tileURL)) {  // update position and scale
        const [x, y] = projection.project(tile.wgs84Extent.min);   // left, bottom
        tile.sprite.position.set(x, y);
        const size = tileSize * Math.pow(2, z - tile.xyz[2]);
        tile.sprite.width = size;
        tile.sprite.height = size;
      } else {   // remove
        tile.sprite.destroy();
        this._tiles.delete(tileURL);
      }
    });

  }

}




/*


    // Update tiles based on current state of `projection`.
    function background(selection) {
        var k = _projection.scale();
        _zoom = geoScaleToZoom(k, _spritesize);

        var pixelOffset;
        if (_source) {
            pixelOffset = [
                _source.offset()[0] * Math.pow(2, _zoom),
                _source.offset()[1] * Math.pow(2, _zoom)
            ];
        } else {
            pixelOffset = [0, 0];
        }

        var translate = [
            _projection.translate()[0] + pixelOffset[0],
            _projection.translate()[1] + pixelOffset[1]
        ];

        // update the tiler's projection (including imagery offset)
        _internal
            .scale(k)
            .translate(translate);

        _tileOrigin = [
            k * Math.PI - translate[0],
            k * Math.PI - translate[1]
        ];

        render(selection);
    }


    // Derive the tiles onscreen, remove those offscreen and position them.
    // Important that this part not depend on `_projection` because it's
    // rentered when tiles load/error (see #644).
    function render(selection) {
        if (!_source) return;
        var tiles = [];
        var showDebug = context.getDebug('tile') && !_source.overlay;
var osm = context.connection();

        var maxZoom = Math.round(_zoom);             // the zoom we want
        var minZoom = Math.max(0, maxZoom - 5);      // the mininimum zoom we'll accept for filling holes
        if (!_source.overzoom) {
            maxZoom = minZoom = Math.floor(_zoom);   // try no zooms outside the one we're at
        }

        // gather tiles to cover viewfield, incl zoomed out tiles if this field contains any holes
        var covered = false;
        for (var z = maxZoom; !covered && z >= minZoom; z--) {
            if (!_source.validZoom(z)) continue;  // zoom out

            _tiler
                .skipNullIsland(!!_source.overlay)
                .zoomRange(z)
                .margin(2);  // prefetch offscreen tiles as well

            var result = _tiler.getTiles(_internal);
            var holes = false;
            for (var i = 0; i < result.tiles.length; i++) {
                var tile = result.tiles[i];

// skip overlay tiles where we have osm data loaded there
if (osm && _source.id === 'mapbox_locator_overlay') {
const loc = tile.wgs84Extent.center();
if (osm.isDataLoaded(loc)) continue;
}
                tile.url = _source.url(tile.xyz);
                if (!tile.url || typeof tile.url !== 'string' || _failures[tile.url]) {
                    holes = true;   // url invalid or has failed in the past
                } else {
                    tiles.push(tile);
                }
            }
            covered = !holes;
        }


        function load(d3_event, tile) {
            delete _failures[tile.url];
            d3_select(this)
                .on('error', null)
                .on('load', null)
                .classed('tile-loaded', true);
            // render(selection);  // why?
        }

        function error(d3_event, tile) {
            _failures[tile.url] = (_failures[tile.url] || 0) + 1;
            d3_select(this)
                .on('error', null)
                .on('load', null)
                .remove();
            render(selection);
        }

        function imageTransform(tile) {
            var d = tile.xyz;
            var ts = _spritesize * Math.pow(2, _zoom - d[2]);
            var scale = tileSizeAtZoom(d, _zoom);
            return 'translate(' +
                ((d[0] * ts) - _tileOrigin[0]) + 'px,' +
                ((d[1] * ts) - _tileOrigin[1]) + 'px) ' +
                'scale(' + scale + ',' + scale + ')';
        }

        function tileCenter(tile) {
            var d = tile.xyz;
            var ts = _spritesize * Math.pow(2, _zoom - d[2]);
            return [
                ((d[0] * ts) - _tileOrigin[0] + (ts / 2)),
                ((d[1] * ts) - _tileOrigin[1] + (ts / 2))
            ];
        }

        function debugTransform(tile) {
            var coord = tileCenter(tile);
            return 'translate(' + coord[0] + 'px,' + coord[1] + 'px)';
        }


        // Pick a representative tile near the center of the viewport
        // (This is useful for sampling the imagery vintage)
        var dims = _internal.dimensions();
        var min = dims[0];
        var max = dims[1];
        var mapCenter = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2];
        var minDist = Math.max(max[0], max[1]);
        var nearCenter;

        tiles.forEach(function(tile) {
            var c = tileCenter(tile);
            var dist = vecLength(c, mapCenter);
            if (dist < minDist) {
                minDist = dist;
                nearCenter = tile;
            }
        });


        var image = selection.selectAll('img')
            .data(tiles, function(tile) { return tile.url; });

        image.exit()
            .remove();   // just remove it
            // .style(transformProp, imageTransform)
            // .classed('tile-removing', true)
            // .classed('tile-center', false)
            // .each(function() {
            //     var img = d3_select(this);
            //     window.setTimeout(function() {
            //         if (img.classed('tile-removing')) {
            //             img.remove();
            //         }
            //     }, 300);
            // });

        image.enter()
          .append('img')
            .attr('class', 'tile')
            .attr('draggable', 'false')
            .attr('loading', 'eager')
            .style('width', _spritesize + 'px')
            .style('height', _spritesize + 'px')
            .style('z-index', function(d) { return d.xyz[2]; })  // draw zoomed tiles above unzoomed tiles
            .attr('src', function(d) { return d.url; })
            .on('error', error)
            .on('load', load)
          .merge(image)
            .style(transformProp, imageTransform)
            .classed('tile-debug', showDebug)
            // .classed('tile-removing', false)
            .classed('tile-center', function(d) { return d === nearCenter; });



        var debug = selection.selectAll('.tile-label-debug')
            .data(showDebug ? tiles : [], function(tile) { return tile.url; });

        debug.exit()
            .remove();

        if (showDebug) {
            var debugEnter = debug.enter()
                .append('div')
                .style('z-index', function(tile) { return tile.xyz[2]; })  // draw zoomed tiles above unzoomed tiles
                .attr('class', 'tile-label-debug');

            debugEnter
                .append('div')
                .attr('class', 'tile-label-debug-coord');

            debugEnter
                .append('div')
                .attr('class', 'tile-label-debug-vintage');

            debug = debug.merge(debugEnter);

            debug
                .style(transformProp, debugTransform);

            debug
                .selectAll('.tile-label-debug-coord')
                .html(function(tile) {
                    let d = tile.xyz;
                    return d[2] + ' / ' + d[0] + ' / ' + d[1];
                });

            debug
                .selectAll('.tile-label-debug-vintage')
                .each(function(tile) {
                    var span = d3_select(this);
                    var center = context.projection.invert(tileCenter(tile));
                    _source.getMetadata(center, tile.xyz, function(err, result) {
                        span.html((result && result.vintage && result.vintage.range) ||
                            t('info_panels.background.vintage') + ': ' + t('info_panels.background.unknown')
                        );
                    });
                });
        }

    }


    background.projection = function(val) {
        if (!arguments.length) return _projection;
        _projection = val;
        return background;
    };


    background.dimensions = function(val) {
        if (!arguments.length) return _internal.dimensions()[1];   // return 'max' only
        _internal.dimensions([[0, 0], val]);                       // set min/max
        return background;
    };


    background.source = function(val) {
        if (!arguments.length) return _source;
        _source = val;
        _spritesize = _source.tileSize;
        _failures = {};
        _tiler.tileSize(_source.tileSize);
        return background;
    };


    return background;
}
*/
