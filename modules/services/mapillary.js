/* global mapillary:false */
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { Extent, Tiler } from '@id-sdk/math';
import { utilQsString, utilStringQs } from '@id-sdk/util';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import RBush from 'rbush';

import { utilRebind } from '../util';

const accessToken = 'MLY|3376030635833192|f13ab0bdf6b2f7b99e0d8bd5868e1d88';
const apiUrl = 'https://graph.mapillary.com/';
const baseTileUrl = 'https://tiles.mapillary.com/maps/vtp';
const mapFeatureTileUrl = `${baseTileUrl}/mly_map_feature_point/2/{z}/{x}/{y}?access_token=${accessToken}`;
const tileUrl = `${baseTileUrl}/mly1_public/2/{z}/{x}/{y}?access_token=${accessToken}`;
const trafficSignTileUrl = `${baseTileUrl}/mly_map_feature_traffic_sign/2/{z}/{x}/{y}?access_token=${accessToken}`;

const viewercss = 'mapillary-js/mapillary.css';
const viewerjs = 'mapillary-js/mapillary.js';
const minZoom = 14;
const dispatch = d3_dispatch('change', 'loadedImages', 'loadedSigns', 'loadedMapFeatures', 'bearingChanged', 'imageChanged');
const tiler = new Tiler().skipNullIsland(true);

let _loadViewerPromise;
let _mlyActiveImage;
let _mlyCache;
let _mlyFallback = false;
let _mlyHighlightedDetection;
let _mlyShowFeatureDetections = false;
let _mlyShowSignDetections = false;
let _mlyViewer;
let _mlyViewerFilter = ['all'];


// Load all data for the specified type from Mapillary vector tiles
function loadTiles(which, url, maxZoom, projection) {
  // determine the needed tiles to cover the view
  const tiles = tiler.zoomRange(minZoom, maxZoom).getTiles(projection).tiles;
  tiles.forEach(tile => loadTile(which, url, tile));
}


// Load all data for the specified type from one vector tile
function loadTile(which, url, tile) {
  const cache = _mlyCache.requests;
  const tileID = `${tile.id}-${which}`;
  if (cache.loaded[tileID] || cache.inflight[tileID]) return;

  const controller = new AbortController();
  cache.inflight[tileID] = controller;
  const requestUrl = url
    .replace('{x}', tile.xyz[0])
    .replace('{y}', tile.xyz[1])
    .replace('{z}', tile.xyz[2]);

  fetch(requestUrl, { signal: controller.signal })
    .then(response => {
      if (!response.ok) {
        throw new Error(response.status + ' ' + response.statusText);
      }
      cache.loaded[tileID] = true;
      return response.arrayBuffer();
    })
    .then(data => {
      if (!data) {
        throw new Error('No Data');
      }

      loadTileDataToCache(data, tile);

      if (which === 'images') {
        dispatch.call('loadedImages');
      } else if (which === 'signs') {
        dispatch.call('loadedSigns');
      } else if (which === 'points') {
        dispatch.call('loadedMapFeatures');
      }
    })
    .catch(err => {
      if (err.name === 'AbortError') return;          // ok
      if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
      cache.loaded[tileID] = true;  // don't retry
    })
    .finally(() => {
      delete cache.inflight[tileID];
    });
}


// Load the data from the vector tile into cache
function loadTileDataToCache(data, tile) {
  const vectorTile = new VectorTile(new Protobuf(data));

  if (vectorTile.layers.hasOwnProperty('image')) {
    const cache = _mlyCache.images;
    const layer = vectorTile.layers.image;
    let boxes = [];

    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i).toGeoJSON(tile.xyz[0], tile.xyz[1], tile.xyz[2]);
      if (!feature) continue;
      if (cache.forImageID[feature.properties.id] !== undefined) continue;  // seen already

      const loc = feature.geometry.coordinates;
      const d = {
        id: feature.properties.id,
        loc: loc,
        captured_at: feature.properties.captured_at,
        ca: feature.properties.compass_angle,
        isPano: feature.properties.is_pano,
        sequenceID: feature.properties.sequence_id,
      };
      cache.forImageID[d.id] = d;
      boxes.push({ minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1], data: d });
    }
    cache.rtree.load(boxes);
  }

  if (vectorTile.layers.hasOwnProperty('sequence')) {
    const cache = _mlyCache.sequences;
    const layer = vectorTile.layers.sequence;

    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i).toGeoJSON(tile.xyz[0], tile.xyz[1], tile.xyz[2]);
      if (!feature) continue;
      const sequenceID = feature.properties.id;

      let lineStrings = cache.get(sequenceID);
      if (!lineStrings) {
        lineStrings = [];
        cache.set(sequenceID, lineStrings);
      }
      lineStrings.push(feature);
    }
  }

  if (vectorTile.layers.hasOwnProperty('point')) {
    const cache = _mlyCache.points;
    const layer = vectorTile.layers.point;
    let boxes = [];

    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i).toGeoJSON(tile.xyz[0], tile.xyz[1], tile.xyz[2]);
      if (!feature) continue;

      const loc = feature.geometry.coordinates;
      const d = {
        id: feature.properties.id,
        loc: loc,
        first_seen_at: feature.properties.first_seen_at,
        last_seen_at: feature.properties.last_seen_at,
        value: feature.properties.value
      };

      boxes.push({ minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1], data: d });
    }
    cache.rtree.load(boxes);
  }

  if (vectorTile.layers.hasOwnProperty('traffic_sign')) {
    const cache = _mlyCache.signs;
    const layer = vectorTile.layers.traffic_sign;
    let boxes = [];

    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i).toGeoJSON(tile.xyz[0], tile.xyz[1], tile.xyz[2]);
      const loc = feature.geometry.coordinates;

      const d = {
        id: feature.properties.id,
        loc: loc,
        first_seen_at: feature.properties.first_seen_at,
        last_seen_at: feature.properties.last_seen_at,
        value: feature.properties.value
      };
      boxes.push({ minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1], data: d });
    }
    cache.rtree.load(boxes);
  }
}


// Get data from the API
function loadDataAsync(url) {
  return fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(response.status + ' ' + response.statusText);
      }
      return response.json();
    })
    .then(result => {
      return result?.data || [];
    })
    .catch(err => {
      if (err.name === 'AbortError') return;          // ok
      if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
    });
}


export default {
  // Initialize Mapillary
  init: function() {
    if (!_mlyCache) {
      this.reset();
    }

    this.event = utilRebind(this, dispatch, 'on');
  },

  // Reset cache and state
  reset: function() {
    if (_mlyCache) {
      Object.values(_mlyCache.requests.inflight).forEach(function(request) { request.abort(); });
    }

    _mlyCache = {
      images: { rtree: new RBush(), forImageID: {} },
      image_detections: { forImageID: {} },
      signs: { rtree: new RBush() },
      points: { rtree: new RBush() },
      sequences: new Map(),    // Map(sequenceID -> Array of LineStrings)
      requests: { loaded: {}, inflight: {} }
    };

    _mlyActiveImage = null;
  },

  // Get visible images
  images: function(projection) {
    const viewport = projection.dimensions();
    const min = [viewport[0][0], viewport[1][1]];
    const max = [viewport[1][0], viewport[0][1]];
    const box = new Extent(projection.invert(min), projection.invert(max)).bbox();
    return _mlyCache.images.rtree.search(box).map(d => d.data);
  },

  // Get visible traffic signs
  signs: function(projection) {
    const viewport = projection.dimensions();
    const min = [viewport[0][0], viewport[1][1]];
    const max = [viewport[1][0], viewport[0][1]];
    const box = new Extent(projection.invert(min), projection.invert(max)).bbox();
    return _mlyCache.signs.rtree.search(box).map(d => d.data);
  },

  // Get visible map (point) features
  mapFeatures: function(projection) {
    const viewport = projection.dimensions();
    const min = [viewport[0][0], viewport[1][1]];
    const max = [viewport[1][0], viewport[0][1]];
    const box = new Extent(projection.invert(min), projection.invert(max)).bbox();
    return _mlyCache.points.rtree.search(box).map(d => d.data);
  },

  // Get cached image by id
  cachedImage: function(imageID) {
    return _mlyCache.images.forImageID[imageID];
  },

  // Get visible sequences
  sequences: function(projection) {
    const viewport = projection.dimensions();
    const min = [viewport[0][0], viewport[1][1]];
    const max = [viewport[1][0], viewport[0][1]];
    const bbox = new Extent(projection.invert(min), projection.invert(max)).bbox();
    let result = new Map();  // Map(sequenceID -> Array of LineStrings)

    // Gather sequences for images in viewport
    for (const box of _mlyCache.images.rtree.search(bbox)) {
      const sequenceID = box.data.sequenceID;
      if (!sequenceID) continue;  // no sequence for this image
      const sequence = _mlyCache.sequences.get(sequenceID);
      if (!sequence) continue;  // sequence not ready

      if (!result.has(sequenceID)) {
        result.set(sequenceID, sequence);
      }
    }
    return [...result.values()];
  },


  // Load images in the visible area
  loadImages: function(projection) {
    loadTiles('images', tileUrl, 14, projection);
  },


  // Load traffic signs in the visible area
  loadSigns: function(projection) {
    loadTiles('signs', trafficSignTileUrl, 14, projection);
  },


  // Load map (point) features in the visible area
  loadMapFeatures: function(projection) {
    loadTiles('points', mapFeatureTileUrl, 14, projection);
  },


  // Return a promise that resolves when the image viewer (Mapillary JS) library has finished loading
  loadViewerAsync: function(context) {
    if (_loadViewerPromise) return _loadViewerPromise;

    // add mly-wrapper
    const wrap = context.container().select('.photoviewer')
      .selectAll('.mly-wrapper')
      .data([0]);

    wrap.enter()
      .append('div')
      .attr('id', 'ideditor-mly')
      .attr('class', 'photo-wrapper mly-wrapper')
      .classed('hide', true);

    const that = this;

    _loadViewerPromise = new Promise((resolve, reject) => {
      let loadedCount = 0;

      function loaded() {
        loadedCount += 1;
        // wait until both files are loaded
        if (loadedCount === 2) resolve();
      }

      const head = d3_select('head');

      // load mapillary-viewercss
      head.selectAll('#ideditor-mapillary-viewercss')
        .data([0])
        .enter()
        .append('link')
        .attr('id', 'ideditor-mapillary-viewercss')
        .attr('rel', 'stylesheet')
        .attr('crossorigin', 'anonymous')
        .attr('href', context.asset(viewercss))
        .on('load.serviceMapillary', loaded)
        .on('error.serviceMapillary', reject);

      // load mapillary-viewerjs
      head.selectAll('#ideditor-mapillary-viewerjs')
        .data([0])
        .enter()
        .append('script')
        .attr('id', 'ideditor-mapillary-viewerjs')
        .attr('crossorigin', 'anonymous')
        .attr('src', context.asset(viewerjs))
        .on('load.serviceMapillary', loaded)
        .on('error.serviceMapillary', reject);
    })
    .then(() => that.initViewer(context))
    .catch(err => {
      if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
      _loadViewerPromise = null;
    });

    return _loadViewerPromise;
  },


  // Load traffic sign image sprites
  loadSignResources: function(context) {
    context.ui().svgDefs.addSprites(['mapillary-sprite'], false /* don't override colors */ );
    return this;
  },


  // Load map (point) feature image sprites
  loadObjectResources: function(context) {
    context.ui().svgDefs.addSprites(['mapillary-object-sprite'], false /* don't override colors */ );
    return this;
  },


  // Remove previous detections in image viewer
  resetTags: function() {
    if (_mlyViewer && !_mlyFallback) {
      _mlyViewer.getComponent('tag').removeAll();
    }
  },


  // Show map feature detections in image viewer
  showFeatureDetections: function(value) {
    _mlyShowFeatureDetections = value;
    if (!_mlyShowFeatureDetections && !_mlyShowSignDetections) {
      this.resetTags();
    }
  },


  // Show traffic sign detections in image viewer
  showSignDetections: function(value) {
    _mlyShowSignDetections = value;
    if (!_mlyShowFeatureDetections && !_mlyShowSignDetections) {
      this.resetTags();
    }
  },


  // Apply filter to image viewer
  filterViewer: function(context) {
    const showsPano = context.photos().showsPanoramic;
    const showsFlat = context.photos().showsFlat;
    const fromDate = context.photos().fromDate;
    const toDate = context.photos().toDate;
    const filter = ['all'];

    if (!showsPano) filter.push([ '!=', 'cameraType', 'spherical' ]);
    if (!showsFlat && showsPano) filter.push(['==', 'pano', true]);
    if (fromDate) {
      filter.push(['>=', 'capturedAt', new Date(fromDate).getTime()]);
    }
    if (toDate) {
      filter.push(['>=', 'capturedAt', new Date(toDate).getTime()]);
    }

    if (_mlyViewer) {
      _mlyViewer.setFilter(filter);
    }
    _mlyViewerFilter = filter;

    return filter;
  },


  // Make the image viewer visible
  showViewer: function(context) {
    const wrap = context.container().select('.photoviewer')
      .classed('hide', false);

    const isHidden = wrap.selectAll('.photo-wrapper.mly-wrapper.hide').size();

    if (isHidden && _mlyViewer) {
      wrap
        .selectAll('.photo-wrapper:not(.mly-wrapper)')
        .classed('hide', true);

      wrap
        .selectAll('.photo-wrapper.mly-wrapper')
        .classed('hide', false);

      _mlyViewer.resize();
    }

    return this;
  },


  // Hide the image viewer and resets map markers
  hideViewer: function(context) {
    _mlyActiveImage = null;

    if (!_mlyFallback && _mlyViewer) {
      _mlyViewer.getComponent('sequence').stop();
    }

    const viewer = context.container().select('.photoviewer');
    if (!viewer.empty()) viewer.datum(null);

    viewer
      .classed('hide', true)
      .selectAll('.photo-wrapper')
      .classed('hide', true);

    this.updateUrlImage(null);

    dispatch.call('imageChanged');
    dispatch.call('loadedMapFeatures');
    dispatch.call('loadedSigns');

    return this.setStyles(context, null);
  },


  // Update the URL with current image id
  updateUrlImage: function(imageID) {
    if (window.mocha) return;

    const hash = utilStringQs(window.location.hash);
    if (imageID) {
      hash.photo = `mapillary/${imageID}`;
    } else {
      delete hash.photo;
    }
    window.location.replace('#' + utilQsString(hash, true));
  },


  // Highlight the detection in the viewer that is related to the clicked map feature
  highlightDetection: function(detection) {
    if (detection) {
      _mlyHighlightedDetection = detection.id;
    }

    return this;
  },


  // Initialize image viewer (Mapillary JS)
  initViewer: function(context) {
    const that = this;
    if (!window.mapillary) return;

    const opts = {
      accessToken: accessToken,
      component: {
        cover: false,
        keyboard: false,
        tag: true
      },
      container: 'ideditor-mly',
    };

    // Disable components requiring WebGL support
    if (!mapillary.isSupported() && mapillary.isFallbackSupported()) {
      _mlyFallback = true;
      opts.component = {
        cover: false,
        direction: false,
        imagePlane: false,
        keyboard: false,
        mouse: false,
        sequence: false,
        tag: false,
        image: true,        // fallback
        navigation: true    // fallback
      };
    }

    _mlyViewer = new mapillary.Viewer(opts);
    _mlyViewer.on('image', imageChanged);
    _mlyViewer.on('bearing', bearingChanged);

    if (_mlyViewerFilter) {
      _mlyViewer.setFilter(_mlyViewerFilter);
    }

    // Register viewer resize handler
    context.ui().photoviewer.on('resize.mapillary', () => {
      if (_mlyViewer) _mlyViewer.resize();
    });

    // imageChanged: called after the viewer has changed images and is ready.
    function imageChanged(node) {
      that.resetTags();
      const image = node.image;
      that.setActiveImage(image);
      that.setStyles(context, null);
      const loc = [image.originalLngLat.lng, image.originalLngLat.lat];
      context.map().centerEase(loc);
      that.updateUrlImage(image.id);

      if (_mlyShowFeatureDetections || _mlyShowSignDetections) {
        that.updateDetections(image.id, `${apiUrl}/${image.id}/detections?access_token=${accessToken}&fields=id,image,geometry,value`);
      }
      dispatch.call('imageChanged');
    }


    // bearingChanged: called when the bearing changes in the image viewer.
    function bearingChanged(e) {
      dispatch.call('bearingChanged', undefined, e);
    }
  },


  // Move to an image
  selectImage: function(context, imageID) {
    if (_mlyViewer && imageID) {
      _mlyViewer
        .moveTo(imageID)
        .catch(err => console.error('mly3', err));   // eslint-disable-line no-console
    }
    return this;
  },


  // Return the currently displayed image
  getActiveImage: function() {
    return _mlyActiveImage;
  },


  // Return a list of detection objects for the given id
  getDetections: function(id) {
    return loadDataAsync(`${apiUrl}/${id}/detections?access_token=${accessToken}&fields=id,value,image`);
  },


  // Set the currently visible image
  setActiveImage: function(image) {
    if (image) {
      _mlyActiveImage = {
        ca: image.originalCompassAngle,
        id: image.id,
        loc: [image.originalLngLat.lng, image.originalLngLat.lat],
        isPano: image.cameraType === 'spherical',
        sequenceID: image.sequenceID
      };
    } else {
      _mlyActiveImage = null;
    }
  },


  // Update the currently highlighted sequence and selected bubble.
  setStyles: function(context, hovered) {
    const hoveredImageID = hovered?.id;
    const hoveredSequenceID = hovered?.sequenceID;
    const selectedSequenceID = _mlyActiveImage && _mlyActiveImage.sequenceID;

    context.container().selectAll('.layer-mapillary .viewfield-group')
      .classed('highlighted', function(d) { return (d.sequenceID === selectedSequenceID) || (d.id === hoveredImageID); })
      .classed('hovered', function(d) { return d.id === hoveredImageID; });

    context.container().selectAll('.layer-mapillary .sequence')
      .classed('highlighted', function(d) { return d.properties.id === hoveredSequenceID; })
      .classed('currentView', function(d) { return d.properties.id === selectedSequenceID; });

    return this;
  },


  // Get detections for the current image and shows them in the image viewer
  updateDetections: function(imageID, url) {
    if (!_mlyViewer || _mlyFallback) return;
    if (!imageID) return;

    const cache = _mlyCache.image_detections;

    if (cache.forImageID[imageID]) {
      showDetections(_mlyCache.image_detections.forImageID[imageID]);
    } else {
      loadDataAsync(url)
        .then(detections => {
          detections.forEach(function(detection) {
            if (!cache.forImageID[imageID]) {
              cache.forImageID[imageID] = [];
            }
            cache.forImageID[imageID].push({
              geometry: detection.geometry,
              id: detection.id,
              image_id: imageID,
              value:detection.value
            });
          });

          showDetections(_mlyCache.image_detections.forImageID[imageID] || []);
        });
    }


    // Create a tag for each detection and shows it in the image viewer
    function showDetections(detections) {
      const tagComponent = _mlyViewer.getComponent('tag');
      for (const data of detections) {
        const tag = makeTag(data);
        if (tag) {
          tagComponent.add([tag]);
        }
      }
    }

    // Create a Mapillary JS tag object
    function makeTag(data) {
      const valueParts = data.value.split('--');
      if (!valueParts.length) return;

      let tag;
      let text;
      let color = 0xffffff;

      if (_mlyHighlightedDetection === data.id) {
        color = 0xffff00;
        text = valueParts[1];
        if (text === 'flat' || text === 'discrete' || text === 'sign') {
          text = valueParts[2];
        }
        text = text.replace(/-/g, ' ');
        text = text.charAt(0).toUpperCase() + text.slice(1);
        _mlyHighlightedDetection = null;
      }

      const decodedGeometry = window.atob(data.geometry);
      let uintArray = new Uint8Array(decodedGeometry.length);
      for (let i = 0; i < decodedGeometry.length; i++) {
        uintArray[i] = decodedGeometry.charCodeAt(i);
      }
      const tile = new VectorTile(new Protobuf(uintArray.buffer));
      const layer = tile.layers['mpy-or'];

      const geometries = layer.feature(0).loadGeometry();

      const polygon = geometries
        .map(ring => ring.map(point => [point.x / layer.extent, point.y / layer.extent]));

      tag = new mapillary.OutlineTag(
        data.id,
        new mapillary.PolygonGeometry(polygon[0]), {
          text: text,
          textColor: color,
          lineColor: color,
          lineWidth: 2,
          fillColor: color,
          fillOpacity: 0.3,
        }
      );

      return tag;
    }
  },


  // Return the current cache
  cache: function() {
    return _mlyCache;
  }
};
