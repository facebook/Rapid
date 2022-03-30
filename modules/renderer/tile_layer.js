import { select as d3_select } from 'd3-selection';
import { t } from '../core/localizer';

import { Projection, Tiler, vecLength} from '@id-sdk/math';

import {  geoScaleToZoom, } from '@id-sdk/geo';
import { utilPrefixCSSProperty } from '../util';


export function rendererTileLayer(context) {
    var transformProp = utilPrefixCSSProperty('Transform');
    var _tiler = new Tiler();
    var _internal = new Projection();     // the projection we use to make the tiler work
    var _projection;                      // hold a reference to a projection from elsewhere

    var _tileSize = 256;
    var _failures = {};
    var _tileOrigin;
    var _zoom;
    var _source;


    function tileSizeAtZoom(d, z) {
        var EPSILON = 0.002;    // close seams
        return ((_tileSize * Math.pow(2, z - d[2])) / _tileSize) + EPSILON;
    }


    // Update tiles based on current state of `projection`.
    function background(selection) {
        var k = _projection.scale();
        _zoom = geoScaleToZoom(k, _tileSize);

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
            var ts = _tileSize * Math.pow(2, _zoom - d[2]);
            var scale = tileSizeAtZoom(d, _zoom);
            return 'translate(' +
                ((d[0] * ts) - _tileOrigin[0]) + 'px,' +
                ((d[1] * ts) - _tileOrigin[1]) + 'px) ' +
                'scale(' + scale + ',' + scale + ')';
        }

        function tileCenter(tile) {
            var d = tile.xyz;
            var ts = _tileSize * Math.pow(2, _zoom - d[2]);
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
            .style('width', _tileSize + 'px')
            .style('height', _tileSize + 'px')
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
        _tileSize = _source.tileSize;
        _failures = {};
        _tiler.tileSize(_source.tileSize);
        return background;
    };


    return background;
}
