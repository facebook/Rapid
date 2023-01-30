import { dispatch as d3_dispatch } from 'd3-dispatch';
import { json as d3_json } from 'd3-fetch';
import { zoom as d3_zoom, zoomIdentity as d3_zoomIdentity } from 'd3-zoom';
import { Extent, Tiler, geoScaleToZoom } from '@id-sdk/math';
import { utilArrayUnion, utilQsString, utilStringQs } from '@id-sdk/util';
import RBush from 'rbush';

import { localizer } from '../core/localizer';
import { utilRebind, utilSetTransform } from '../util';


var apibase = 'https://kartaview.org';
var maxResults = 1000;
var tileZoom = 14;
var tiler = new Tiler().skipNullIsland(true);
var dispatch = d3_dispatch('loadedImages');
var imgZoom = d3_zoom()
    .extent([[0, 0], [320, 240]])
    .translateExtent([[0, 0], [320, 240]])
    .scaleExtent([1, 15]);
var _oscCache;
var _oscSelectedImage;
var _loadViewerPromise;


function abortRequest(controller) {
    controller.abort();
}


function maxPageAtZoom(z) {
    if (z < 15)   return 2;
    if (z === 15) return 5;
    if (z === 16) return 10;
    if (z === 17) return 20;
    if (z === 18) return 40;
    if (z > 18)   return 80;
}


function loadTiles(which, url, projection) {
    var currZoom = Math.floor(geoScaleToZoom(projection.scale()));
    // determine the needed tiles to cover the view
    var tiles = tiler.zoomRange(tileZoom).getTiles(projection).tiles;

    // abort inflight requests that are no longer needed
    var cache = _oscCache[which];
    Object.keys(cache.inflight).forEach(function(k) {
        var wanted = tiles.find(function(tile) { return k.indexOf(tile.id + ',') === 0; });
        if (!wanted) {
            abortRequest(cache.inflight[k]);
            delete cache.inflight[k];
        }
    });

    tiles.forEach(function(tile) {
        loadNextTilePage(which, currZoom, url, tile);
    });
}


function loadNextTilePage(which, currZoom, url, tile) {
    var cache = _oscCache[which];
    var bbox = tile.wgs84Extent.bbox();
    var maxPages = maxPageAtZoom(currZoom);
    var nextPage = cache.nextPage[tile.id] || 1;
    var params = utilQsString({
        ipp: maxResults,
        page: nextPage,
        // client_id: clientId,
        bbTopLeft: [bbox.maxY, bbox.minX].join(','),
        bbBottomRight: [bbox.minY, bbox.maxX].join(',')
    }, true);

    if (nextPage > maxPages) return;

    var id = tile.id + ',' + String(nextPage);
    if (cache.loaded[id] || cache.inflight[id]) return;

    var controller = new AbortController();
    cache.inflight[id] = controller;

    var options = {
        method: 'POST',
        signal: controller.signal,
        body: params,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    };

    d3_json(url, options)
        .then(function(data) {
            cache.loaded[id] = true;
            delete cache.inflight[id];
            if (!data || !data.currentPageItems || !data.currentPageItems.length) {
                throw new Error('No Data');
            }

            var features = data.currentPageItems.map(image => {
                var loc = [+image.lng, +image.lat];
                var d;

                if (which === 'images') {
                    d = {
                        id: image.id,
                        loc: loc,
                        ca: +image.heading,
                        captured_at: (image.shot_date || image.date_added),
                        captured_by: image.username,
                        imagePath: image.lth_name,
                        sequenceID: image.sequence_id,
                        sequenceIndex: +image.sequence_index
                    };

                    // cache sequence info
                    var seq = _oscCache.sequences[d.sequenceID];
                    if (!seq) {
                        seq = { rotation: 0, images: [] };
                        _oscCache.sequences[d.sequenceID] = seq;
                    }
                    seq.images[d.sequenceIndex] = d;
                    _oscCache.images.forImageKey[d.id] = d;     // cache imageKey -> image
                }

                return {
                    minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1], data: d
                };
            });

            cache.rtree.load(features);

            if (data.currentPageItems.length === maxResults) {  // more pages to load
                cache.nextPage[tile.id] = nextPage + 1;
                loadNextTilePage(which, currZoom, url, tile);
            } else {
                cache.nextPage[tile.id] = Infinity;     // no more pages to load
            }

            if (which === 'images') {
                dispatch.call('loadedImages');
            }
        })
        .catch(function() {
            cache.loaded[id] = true;
            delete cache.inflight[id];
        });
}



export default {

    init: function() {
        if (!_oscCache) {
            this.reset();
        }

        this.event = utilRebind(this, dispatch, 'on');
    },

    reset: function() {
        if (_oscCache) {
            Object.values(_oscCache.images.inflight).forEach(abortRequest);
        }

        _oscCache = {
            images: { inflight: {}, loaded: {}, nextPage: {}, rtree: new RBush(), forImageKey: {} },
            sequences: {}
        };

        _oscSelectedImage = null;
    },


    images: function(projection) {
      const viewport = projection.dimensions();
      const min = [viewport[0][0], viewport[1][1]];
      const max = [viewport[1][0], viewport[0][1]];
      const box = new Extent(projection.invert(min), projection.invert(max)).bbox();
      return _oscCache.images.rtree.search(box).map(d => d.data);
    },


    sequences: function(projection) {
      const viewport = projection.dimensions();
      const min = [viewport[0][0], viewport[1][1]];
      const max = [viewport[1][0], viewport[0][1]];
      const bbox = new Extent(projection.invert(min), projection.invert(max)).bbox();
      const sequenceIDs = new Set();

      // Gather all sequences for images in viewport..
      _oscCache.images.rtree.search(bbox).forEach(d => sequenceIDs.add(d.data.sequenceID));

      // Make GeoJSON LineStrings from those sequences..
      let lineStrings = [];
      for (const sequenceID of sequenceIDs) {
        const sequence = _oscCache.sequences[sequenceID];
        const images = sequence?.images ?? [];
        if (!images.length) continue;

        lineStrings.push({
          type: 'LineString',
          coordinates: images.map(d => d.loc).filter(Boolean),
          properties: {
            id: sequenceID,
            captured_at: images[0]?.captured_at,
            captured_by: images[0]?.captured_by
          }
        });
      }
      return lineStrings;
    },


    cachedImage: function(imageKey) {
        return _oscCache.images.forImageKey[imageKey];
    },


    loadImages: function(projection) {
        var url = apibase + '/1.0/list/nearby-photos/';
        loadTiles('images', url, projection);
    },


    loadViewerAsync: function(context) {
        if (_loadViewerPromise) return _loadViewerPromise;

        // add osc-wrapper
        var wrap = context.container().select('.photoviewer').selectAll('.osc-wrapper')
            .data([0]);

        var that = this;

        var wrapEnter = wrap.enter()
            .append('div')
            .attr('class', 'photo-wrapper osc-wrapper')
            .classed('hide', true)
            .call(imgZoom.on('zoom', zoomPan))
            .on('dblclick.zoom', null);

        wrapEnter
            .append('div')
            .attr('class', 'photo-attribution fillD');

        var controlsEnter = wrapEnter
            .append('div')
            .attr('class', 'photo-controls-wrap')
            .append('div')
            .attr('class', 'photo-controls');

        controlsEnter
            .append('button')
            .on('click.back', step(-1))
            .html('◄');

        controlsEnter
            .append('button')
            .on('click.rotate-ccw', rotate(-90))
            .html('⤿');

        controlsEnter
            .append('button')
            .on('click.rotate-cw', rotate(90))
            .html('⤾');

        controlsEnter
            .append('button')
            .on('click.forward', step(1))
            .html('►');

        wrapEnter
            .append('div')
            .attr('class', 'osc-image-wrap');


        // Register viewer resize handler
        context.ui().photoviewer.on('resize.kartaview', function(dimensions) {
            imgZoom = d3_zoom()
                .extent([[0, 0], dimensions])
                .translateExtent([[0, 0], dimensions])
                .scaleExtent([1, 15])
                .on('zoom', zoomPan);
        });


        function zoomPan(d3_event) {
            var t = d3_event.transform;
            context.container().select('.photoviewer .osc-image-wrap')
                .call(utilSetTransform, t.x, t.y, t.k);
        }


        function rotate(deg) {
            return function() {
                if (!_oscSelectedImage) return;
                var sequenceID = _oscSelectedImage.sequenceID;
                var sequence = _oscCache.sequences[sequenceID];
                if (!sequence) return;

                var r = sequence.rotation || 0;
                r += deg;

                if (r > 180) r -= 360;
                if (r < -180) r += 360;
                sequence.rotation = r;

                var wrap = context.container().select('.photoviewer .osc-wrapper');

                wrap
                    .transition()
                    .duration(100)
                    .call(imgZoom.transform, d3_zoomIdentity);

                wrap.selectAll('.osc-image')
                    .transition()
                    .duration(100)
                    .style('transform', 'rotate(' + r + 'deg)');
            };
        }

        function step(stepBy) {
            return function() {
                if (!_oscSelectedImage) return;
                var sequenceID = _oscSelectedImage.sequenceID;
                var sequence = _oscCache.sequences[sequenceID];
                if (!sequence) return;

                var nextIndex = _oscSelectedImage.sequenceIndex + stepBy;
                var nextImage = sequence.images[nextIndex];
                if (!nextImage) return;

                context.map().centerEase(nextImage.loc);

                that
                    .selectImage(context, nextImage.id);
            };
        }

        // don't need any async loading so resolve immediately
        _loadViewerPromise = Promise.resolve();

        return _loadViewerPromise;
    },


    showViewer: function(context) {
        var viewer = context.container().select('.photoviewer')
            .classed('hide', false);

        var isHidden = viewer.selectAll('.photo-wrapper.osc-wrapper.hide').size();

        if (isHidden) {
            viewer
                .selectAll('.photo-wrapper:not(.osc-wrapper)')
                .classed('hide', true);

            viewer
                .selectAll('.photo-wrapper.osc-wrapper')
                .classed('hide', false);
        }

        return this;
    },


    hideViewer: function(context) {
        _oscSelectedImage = null;

        this.updateUrlImage(null);

        var viewer = context.container().select('.photoviewer');
        if (!viewer.empty()) viewer.datum(null);

        viewer
            .classed('hide', true)
            .selectAll('.photo-wrapper')
            .classed('hide', true);

        context.container().selectAll('.viewfield-group, .sequence, .icon-sign')
            .classed('currentView', false);

        return this.setStyles(context, null, true);
    },


    selectImage: function(context, imageKey) {
        var d = this.cachedImage(imageKey);

        _oscSelectedImage = d;

        this.updateUrlImage(imageKey);

        var viewer = context.container().select('.photoviewer');
        if (!viewer.empty()) viewer.datum(d);

        this.setStyles(context, null, true);

        context.container().selectAll('.icon-sign')
            .classed('currentView', false);

        if (!d) return this;

        var wrap = context.container().select('.photoviewer .osc-wrapper');
        var imageWrap = wrap.selectAll('.osc-image-wrap');
        var attribution = wrap.selectAll('.photo-attribution').html('');

        wrap
            .transition()
            .duration(100)
            .call(imgZoom.transform, d3_zoomIdentity);

        imageWrap
            .selectAll('.osc-image')
            .remove();

        if (d) {
            var sequence = _oscCache.sequences[d.sequenceID];
            var r = (sequence && sequence.rotation) || 0;

            imageWrap
                .append('img')
                .attr('class', 'osc-image')
                .attr('src', apibase + '/' + d.imagePath)
                .style('transform', 'rotate(' + r + 'deg)');

            if (d.captured_by) {
                attribution
                    .append('a')
                    .attr('class', 'captured_by')
                    .attr('target', '_blank')
                    .attr('href', 'https://kartaview.org/user/' + encodeURIComponent(d.captured_by))
                    .text('@' + d.captured_by);

                attribution
                    .append('span')
                    .text('|');
            }

            if (d.captured_at) {
                attribution
                    .append('span')
                    .attr('class', 'captured_at')
                    .text(localeDateString(d.captured_at));

                attribution
                    .append('span')
                    .text('|');
            }

            attribution
                .append('a')
                .attr('class', 'image-link')
                .attr('target', '_blank')
                .attr('href', 'https://kartaview.org/details/' + d.sequenceID + '/' + d.sequenceIndex)
                .text('kartaview.org');
        }

        return this;


        function localeDateString(s) {
            if (!s) return null;
            var options = { day: 'numeric', month: 'short', year: 'numeric' };
            var d = new Date(s);
            if (isNaN(d.getTime())) return null;
            return d.toLocaleDateString(localizer.localeCode(), options);
        }
    },


    getSelectedImage: function() {
        return _oscSelectedImage;
    },


    // Updates the currently highlighted sequence and selected bubble.
    // Reset is only necessary when interacting with the viewport because
    // this implicitly changes the currently selected bubble/sequence
    setStyles: function(context, hovered, reset) {
        if (reset) {  // reset all layers
            context.container().selectAll('.viewfield-group')
                .classed('highlighted', false)
                .classed('hovered', false)
                .classed('currentView', false);

            context.container().selectAll('.sequence')
                .classed('highlighted', false)
                .classed('currentView', false);
        }

        var hoveredImageID = hovered?.id;
        var hoveredSequenceID = hovered?.sequenceID;
        var hoveredSequence = hoveredSequenceID && _oscCache.sequences[hoveredSequenceID];
        var hoveredImageIDs = (hoveredSequence && hoveredSequence.images.map(function (d) { return d.id; })) || [];

        var viewer = context.container().select('.photoviewer');
        var selected = viewer.empty() ? undefined : viewer.datum();
        var selectedImageID = selected?.id;
        var selectedSequenceID = selected?.sequenceID;
        var selectedSequence = selectedSequenceID && _oscCache.sequences[selectedSequenceID];
        var selectedImageIDs = (selectedSequence && selectedSequence.images.map(function (d) { return d.id; })) || [];

        // highlight sibling viewfields on either the selected or the hovered sequences
        var highlightedImageIDs = utilArrayUnion(hoveredImageIDs, selectedImageIDs);

        context.container().selectAll('.layer-kartaview .viewfield-group')
            .classed('highlighted', function(d) { return highlightedImageIDs.indexOf(d.id) !== -1; })
            .classed('hovered', function(d) { return d.id === hoveredImageID; })
            .classed('currentView', function(d) { return d.id === selectedImageID; });

        context.container().selectAll('.layer-kartaview .sequence')
            .classed('highlighted', function(d) { return d.properties.id === hoveredSequenceID; })
            .classed('currentView', function(d) { return d.properties.id === selectedSequenceID; });

        // update viewfields if needed
        context.container().selectAll('.layer-kartaview .viewfield-group .viewfield')
            .attr('d', viewfieldPath);

        function viewfieldPath() {
            var d = this.parentNode.__data__;
            if (d.isPano && d.id !== selectedImageID) {
                return 'M 8,13 m -10,0 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0';
            } else {
                return 'M 6,9 C 8,8.4 8,8.4 10,9 L 16,-2 C 12,-5 4,-5 0,-2 z';
            }
        }

        return this;
    },


    updateUrlImage: function(imageKey) {
        if (!window.mocha) {
            var hash = utilStringQs(window.location.hash);
            if (imageKey) {
                hash.photo = 'kartaview/' + imageKey;
            } else {
                delete hash.photo;
            }
            window.location.replace('#' + utilQsString(hash, true));
        }
    },


    cache: function() {
        return _oscCache;
    }

};
