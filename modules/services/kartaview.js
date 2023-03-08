import { dispatch as d3_dispatch } from 'd3-dispatch';
import { json as d3_json } from 'd3-fetch';
import { zoom as d3_zoom, zoomIdentity as d3_zoomIdentity } from 'd3-zoom';
import { Extent, Tiler, geoScaleToZoom } from '@id-sdk/math';
import { utilArrayUnion, utilQsString } from '@id-sdk/util';
import RBush from 'rbush';

import { localizer } from '../core/localizer';
import { utilRebind, utilSetTransform } from '../util';


const apibase = 'https://kartaview.org';
const maxResults = 1000;
const TILEZOOM = 14;
const tiler = new Tiler().skipNullIsland(true);
const dispatch = d3_dispatch('loadedImages');

let _imgZoom = d3_zoom()
  .extent([[0, 0], [320, 240]])
  .translateExtent([[0, 0], [320, 240]])
  .scaleExtent([1, 15]);

let _kartaviewCache;
let _kartaviewSelectedImage;
let _loadViewerPromise;


function maxPageAtZoom(z) {
  if (z < 15)   return 2;
  if (z === 15) return 5;
  if (z === 16) return 10;
  if (z === 17) return 20;
  if (z === 18) return 40;
  if (z > 18)   return 80;
}


function loadTiles(projection) {
  const currZoom = Math.floor(geoScaleToZoom(projection.scale()));
  // Determine the needed tiles to cover the view
  const needTiles = tiler.zoomRange(TILEZOOM).getTiles(projection).tiles;

  // Abort inflight requests that are no longer needed
  for (const [k, inflight] of _kartaviewCache.inflight.entries()) {
    const needed = needTiles.find(tile => k.indexOf(tile.id) === 0);
    if (!needed) {
      inflight.controller.abort();
    }
  }

  // Fetch files that are needed
  for (const tile of needTiles) {
    loadNextTilePage(currZoom, tile);
  }
}


function loadNextTilePage(currZoom, tile) {
  const bbox = tile.wgs84Extent.bbox();
  const maxPages = maxPageAtZoom(currZoom);
  const nextPage = _kartaviewCache.nextPage.get(tile.id) ?? 1;

  if (nextPage > maxPages) return;

  const k = `${tile.id},${nextPage}`;
  if (_kartaviewCache.loaded.has(k) || _kartaviewCache.inflight.has(k)) return;

  const params = utilQsString({
    ipp: maxResults,
    page: nextPage,
    // client_id: clientId,
    bbTopLeft: [bbox.maxY, bbox.minX].join(','),
    bbBottomRight: [bbox.minY, bbox.maxX].join(',')
  }, true);

  const controller = new AbortController();
  const options = {
    method: 'POST',
    signal: controller.signal,
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  };

  const url = `${apibase}/1.0/list/nearby-photos/`;
  const promise = d3_json(url, options)
    .then(data => {
      _kartaviewCache.loaded.add(k);
      if (!data || !data.currentPageItems || !data.currentPageItems.length) {
        throw new Error('No Data');
      }

      const boxes = data.currentPageItems.map(image => {
        if (_kartaviewCache.images.has(image.id)) return null;  // skip duplicates

        const loc = [+image.lng, +image.lat];
        const d = {
          id: image.id,
          loc: loc,
          ca: +image.heading,
          captured_at: (image.shot_date || image.date_added),
          captured_by: image.username,
          imagePath: image.lth_name,
          sequenceID: image.sequence_id,
          sequenceIndex: +image.sequence_index
        };
        // cache image info
        _kartaviewCache.images.set(d.id, d);

        // cache sequence info
        let sequence = _kartaviewCache.sequences.get(d.sequenceID);
        if (!sequence) {
          sequence = { rotation: 0, images: [], v: 0 };
          _kartaviewCache.sequences.set(d.sequenceID, sequence);
        }
        // add image to sequence - note that `images` may be a sparse array
        sequence.images[d.sequenceIndex] = d;
        sequence.v++;

        return {
          minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1], data: d
        };
      }).filter(Boolean);

      _kartaviewCache.rtree.load(boxes);

      if (data.currentPageItems.length === maxResults) {   // more pages to load
        _kartaviewCache.nextPage.set(tile.id, nextPage + 1);
        loadNextTilePage(currZoom, tile);      // recurse
      } else {
        _kartaviewCache.nextPage.set(tile.id, Infinity);   // no more pages to load
      }

      dispatch.call('loadedImages');
    })
    .catch(err => {
      if (err.name === 'AbortError') return;          // ok
      if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
    })
    .finally(() => {
      _kartaviewCache.inflight.delete(k);
    });

  _kartaviewCache.inflight.set(k, { promise: promise, controller: controller });
}



export default {

  init: function() {
    if (!_kartaviewCache) {
      this.reset();
    }

    this.event = utilRebind(this, dispatch, 'on');
  },

  reset: function() {
    if (_kartaviewCache) {
      for (const inflight of _kartaviewCache.inflight.values()) {
        inflight.controller.abort();
      }
    }

    _kartaviewCache = {
      inflight:  new Map(),   // Map(k -> { Promise, AbortController})
      loaded:    new Set(),   // Set(k)   (where k is like `${tile.id},${nextPage}`)
      nextPage:  new Map(),   // Map(tileID -> Number)
      images:    new Map(),   // Map(imageID -> image data)
      sequences: new Map(),   // Map(sequenceID -> sequence data)
      rtree:     new RBush()
    };

    _kartaviewSelectedImage = null;
  },


  images: function(projection) {
    const viewport = projection.dimensions();
    const min = [viewport[0][0], viewport[1][1]];
    const max = [viewport[1][0], viewport[0][1]];
    const box = new Extent(projection.invert(min), projection.invert(max)).bbox();
    return _kartaviewCache.rtree.search(box).map(d => d.data);
  },


  sequences: function(projection) {
    const viewport = projection.dimensions();
    const min = [viewport[0][0], viewport[1][1]];
    const max = [viewport[1][0], viewport[0][1]];
    const bbox = new Extent(projection.invert(min), projection.invert(max)).bbox();
    let sequenceIDs = new Set();

    // Gather sequences for images in viewport
    for (const box of _kartaviewCache.rtree.search(bbox)) {
      if (box.data.sequenceID) sequenceIDs.add(box.data.sequenceID);
    }

    // Make GeoJSON LineStrings from those sequences..
    let lineStrings = [];
    for (const sequenceID of sequenceIDs) {
      const sequence = _kartaviewCache.sequences.get(sequenceID);
      const images = sequence?.images ?? [];   // note that `images` may be a sparse array
      if (!images.length) continue;

      lineStrings.push({
        type: 'LineString',
        coordinates: images.map(d => d.loc).filter(Boolean),
        properties: {
          id: sequenceID,
          v: sequence.v,
          captured_at: images[0]?.captured_at,
          captured_by: images[0]?.captured_by
        }
      });
    }
    return lineStrings;
  },


  cachedImage: function(imageID) {
    return _kartaviewCache.images.get(imageID);
  },


  loadImages: function(projection) {
    loadTiles(projection);
  },


  loadViewerAsync: function(context) {
    if (_loadViewerPromise) return _loadViewerPromise;

    // add osc-wrapper
    let wrap = context.container().select('.photoviewer').selectAll('.osc-wrapper')
      .data([0]);

    let wrapEnter = wrap.enter()
      .append('div')
      .attr('class', 'photo-wrapper osc-wrapper')
      .classed('hide', true)
      .call(_imgZoom.on('zoom', zoomPan))
      .on('dblclick.zoom', null);

    wrapEnter
      .append('div')
      .attr('class', 'photo-attribution fillD');

    let controlsEnter = wrapEnter
      .append('div')
      .attr('class', 'photo-controls-wrap')
      .append('div')
      .attr('class', 'photo-controls');

    controlsEnter
      .append('button')
      .on('click.back', () => step(-1))
      .html('◄');

    controlsEnter
      .append('button')
      .on('click.rotate-ccw', () => rotate(-90))
      .html('⤿');

    controlsEnter
      .append('button')
      .on('click.rotate-cw', () => rotate(90))
      .html('⤾');

    controlsEnter
      .append('button')
      .on('click.forward', () => step(1))
      .html('►');

    wrapEnter
      .append('div')
      .attr('class', 'osc-image-wrap');


    // Register viewer resize handler
    context.ui().photoviewer.on('resize.kartaview', dimensions => {
      _imgZoom = d3_zoom()
        .extent([[0, 0], dimensions])
        .translateExtent([[0, 0], dimensions])
        .scaleExtent([1, 15])
        .on('zoom', zoomPan);
    });


    function zoomPan(d3_event) {
      const t = d3_event.transform;
      context.container().select('.photoviewer .osc-image-wrap')
        .call(utilSetTransform, t.x, t.y, t.k);
    }


    function rotate(deg) {
      if (!_kartaviewSelectedImage) return;
      const sequenceID = _kartaviewSelectedImage.sequenceID;
      const sequence = _kartaviewCache.sequences.get(sequenceID);
      if (!sequence) return;

      let r = sequence.rotation || 0;
      r += deg;

      if (r > 180) r -= 360;
      if (r < -180) r += 360;
      sequence.rotation = r;

      let wrap = context.container().select('.photoviewer .osc-wrapper');

      wrap
        .transition()
        .duration(100)
        .call(_imgZoom.transform, d3_zoomIdentity);

      wrap.selectAll('.osc-image')
        .transition()
        .duration(100)
        .style('transform', `rotate(${r}deg)`);
    }

    function step(stepBy) {
      if (!_kartaviewSelectedImage) return;
      const sequenceID = _kartaviewSelectedImage.sequenceID;
      const sequence = _kartaviewCache.sequences.get(sequenceID);
      if (!sequence) return;

      const nextIndex = _kartaviewSelectedImage.sequenceIndex + stepBy;
      const nextImage = sequence.images[nextIndex];
      if (!nextImage) return;

      context.map().centerEase(nextImage.loc);
      context.photos().selectPhoto('kartaview', nextImage.id);
    }

    // don't need any async loading so resolve immediately
    _loadViewerPromise = Promise.resolve();

    return _loadViewerPromise;
  },


  showViewer: function(context) {
    let viewer = context.container().select('.photoviewer')
      .classed('hide', false);

    let isHidden = viewer.selectAll('.photo-wrapper.osc-wrapper.hide').size();

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
    _kartaviewSelectedImage = null;
    context.photos().selectPhoto(null);

    let viewer = context.container().select('.photoviewer');
    if (!viewer.empty()) viewer.datum(null);

    viewer
      .classed('hide', true)
      .selectAll('.photo-wrapper')
      .classed('hide', true);

    context.container().selectAll('.viewfield-group, .sequence, .icon-sign')
      .classed('currentView', false);

    return this.setStyles(context, null, true);
  },


  // note: call `context.photos().selectPhoto(layerID, photoID)` instead
  // That will deal with the URL and call this function
  selectImage: function(context, imageKey) {
    let d = this.cachedImage(imageKey);
    _kartaviewSelectedImage = d;

    let viewer = context.container().select('.photoviewer');
    if (!viewer.empty()) viewer.datum(d);

    this.setStyles(context, null, true);

    context.container().selectAll('.icon-sign')
      .classed('currentView', false);

    if (!d) return this;

    let wrap = context.container().select('.photoviewer .osc-wrapper');
    let imageWrap = wrap.selectAll('.osc-image-wrap');
    let attribution = wrap.selectAll('.photo-attribution').html('');

    wrap
      .transition()
      .duration(100)
      .call(_imgZoom.transform, d3_zoomIdentity);

    imageWrap
      .selectAll('.osc-image')
      .remove();

    if (d) {
      const sequence = _kartaviewCache.sequences.get(d.sequenceID);
      const r = sequence?.rotation ?? 0;

      imageWrap
        .append('img')
        .attr('class', 'osc-image')
        .attr('src', `${apibase}/${d.imagePath}`)
        .style('transform', `rotate(${r}deg)`);

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
        .attr('href', `https://kartaview.org/details/${d.sequenceID}/${d.sequenceIndex}`)
        .text('kartaview.org');
    }

    return this;


    function localeDateString(s) {
      if (!s) return null;
      const options = { day: 'numeric', month: 'short', year: 'numeric' };
      const d = new Date(s);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString(localizer.localeCode(), options);
    }
  },


  getSelectedImage: function() {
    return _kartaviewSelectedImage;
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

    let hoveredImageID = hovered?.id;
    let hoveredSequenceID = hovered?.sequenceID;
    let hoveredSequence = hoveredSequenceID && _kartaviewCache.sequences.get(hoveredSequenceID);
    let hoveredImageIDs = (hoveredSequence && hoveredSequence.images.map(function (d) { return d.id; })) || [];

    let viewer = context.container().select('.photoviewer');
    let selected = viewer.empty() ? undefined : viewer.datum();
    let selectedImageID = selected?.id;
    let selectedSequenceID = selected?.sequenceID;
    let selectedSequence = selectedSequenceID && _kartaviewCache.sequences.get(selectedSequenceID);
    let selectedImageIDs = (selectedSequence && selectedSequence.images.map(function (d) { return d.id; })) || [];

    // highlight sibling viewfields on either the selected or the hovered sequences
    let highlightedImageIDs = utilArrayUnion(hoveredImageIDs, selectedImageIDs);

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
      let d = this.parentNode.__data__;
      if (d.isPano && d.id !== selectedImageID) {
        return 'M 8,13 m -10,0 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0';
      } else {
        return 'M 6,9 C 8,8.4 8,8.4 10,9 L 16,-2 C 12,-5 4,-5 0,-2 z';
      }
    }

    return this;
  },


  cache: function() {
    return _kartaviewCache;
  }

};
