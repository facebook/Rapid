import { select as d3_select } from 'd3-selection';
import { Extent, Tiler } from '@rapid-sdk/math';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import RBush from 'rbush';

import { AbstractService } from './AbstractService';

const accessToken = 'MLY|3376030635833192|f13ab0bdf6b2f7b99e0d8bd5868e1d88';
const apiUrl = 'https://graph.mapillary.com/';
const baseTileUrl = 'https://tiles.mapillary.com/maps/vtp';
const mapFeatureTileUrl = `${baseTileUrl}/mly_map_feature_point/2/{z}/{x}/{y}?access_token=${accessToken}`;
const tileUrl = `${baseTileUrl}/mly1_public/2/{z}/{x}/{y}?access_token=${accessToken}`;
const trafficSignTileUrl = `${baseTileUrl}/mly_map_feature_traffic_sign/2/{z}/{x}/{y}?access_token=${accessToken}`;

const viewercss = 'mapillary-js/mapillary.css';
const viewerjs = 'mapillary-js/mapillary.js';
const minZoom = 14;


/**
 * `MapillaryService`
 * Events available:
 *   `imageChanged`
 *   `bearingChanged`
 *   `loadedImages`
 *   `loadedSigns`
 *   `loadedMapFeatures`
 */
export class MapillaryService extends AbstractService {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'mapillary';

    this._loadViewerPromise = null;
    this._mlyActiveImage = null;
    this._mlyCache = {};

    this._mlyFallback = false;
    this._mlyHighlightedDetection = null;
    this._mlyShowFeatureDetections = false;
    this._mlyShowSignDetections = false;
    this._mlyViewer = null;
    this._mlyViewerFilter = ['all'];
    this._tiler = new Tiler().skipNullIsland(true);
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    return this.resetAsync();
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    return Promise.resolve();  // or return this.loadViewerAsync() ?
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    if (this._mlyCache.requests) {
      Object.values(this._mlyCache.requests.inflight).forEach(function(request) { request.abort(); });
    }

    this._mlyCache = {
      images: { rtree: new RBush(), forImageID: {} },
      image_detections: { forImageID: {} },
      signs: { rtree: new RBush() },
      points: { rtree: new RBush() },
      sequences: new Map(),    // Map(sequenceID -> Array of LineStrings)
      requests: { loaded: {}, inflight: {} }
    };

    this._mlyActiveImage = null;

    return Promise.resolve();
  }


  // Get visible images
  images(projection) {
    const viewport = projection.dimensions();
    const min = [viewport[0][0], viewport[1][1]];
    const max = [viewport[1][0], viewport[0][1]];
    const box = new Extent(projection.invert(min), projection.invert(max)).bbox();
    return this._mlyCache.images.rtree.search(box).map(d => d.data);
  }

  // Get visible traffic signs
  signs(projection) {
    const viewport = projection.dimensions();
    const min = [viewport[0][0], viewport[1][1]];
    const max = [viewport[1][0], viewport[0][1]];
    const box = new Extent(projection.invert(min), projection.invert(max)).bbox();
    return this._mlyCache.signs.rtree.search(box).map(d => d.data);
  }

  // Get visible map (point) features
  mapFeatures(projection) {
    const viewport = projection.dimensions();
    const min = [viewport[0][0], viewport[1][1]];
    const max = [viewport[1][0], viewport[0][1]];
    const box = new Extent(projection.invert(min), projection.invert(max)).bbox();
    return this._mlyCache.points.rtree.search(box).map(d => d.data);
  }

  // Get cached image by id
  cachedImage(imageID) {
    return this._mlyCache.images.forImageID[imageID];
  }

  // Get visible sequences
  sequences(projection) {
    const viewport = projection.dimensions();
    const min = [viewport[0][0], viewport[1][1]];
    const max = [viewport[1][0], viewport[0][1]];
    const bbox = new Extent(projection.invert(min), projection.invert(max)).bbox();
    let result = new Map();  // Map(sequenceID -> Array of LineStrings)

    // Gather sequences for images in viewport
    for (const box of this._mlyCache.images.rtree.search(bbox)) {
      const sequenceID = box.data.sequenceID;
      if (!sequenceID) continue;  // no sequence for this image
      const sequence = this._mlyCache.sequences.get(sequenceID);
      if (!sequence) continue;  // sequence not ready

      if (!result.has(sequenceID)) {
        result.set(sequenceID, sequence);
      }
    }
    return [...result.values()];
  }


  // Load images in the visible area
  loadImages(projection) {
    this._loadTiles('images', tileUrl, 14, projection);
  }


  // Load traffic signs in the visible area
  loadSigns(projection) {
    this._loadTiles('signs', trafficSignTileUrl, 14, projection);
  }


  // Load map (point) features in the visible area
  loadMapFeatures(projection) {
    this._loadTiles('points', mapFeatureTileUrl, 14, projection);
  }


  // Return a promise that resolves when the image viewer (Mapillary JS) library has finished loading
  loadViewerAsync() {
    if (this._loadViewerPromise) return this._loadViewerPromise;

    const context = this.context;

    // add mly-wrapper
    const wrap = context.container().select('.photoviewer')
      .selectAll('.mly-wrapper')
      .data([0]);

    wrap.enter()
      .append('div')
      .attr('id', 'ideditor-mly')
      .attr('class', 'photo-wrapper mly-wrapper')
      .classed('hide', true);

    this._loadViewerPromise = new Promise((resolve, reject) => {
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
        .on('load.MapillaryService', loaded)
        .on('error.MapillaryService', reject);

      // load mapillary-viewerjs
      head.selectAll('#ideditor-mapillary-viewerjs')
        .data([0])
        .enter()
        .append('script')
        .attr('id', 'ideditor-mapillary-viewerjs')
        .attr('crossorigin', 'anonymous')
        .attr('src', context.asset(viewerjs))
        .on('load.MapillaryService', loaded)
        .on('error.MapillaryService', reject);
    })
    .then(() => this.initViewer())
    .catch(err => {
      if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
      this._loadViewerPromise = null;
    });

    return this._loadViewerPromise;
  }


  // Remove previous detections in image viewer
  resetTags() {
    if (this._mlyViewer && !this._mlyFallback) {
      this._mlyViewer.getComponent('tag').removeAll();
    }
  }


  // Show map feature detections in image viewer
  showFeatureDetections(value) {
    this._mlyShowFeatureDetections = value;
    if (!this._mlyShowFeatureDetections && !this._mlyShowSignDetections) {
      this.resetTags();
    }
  }


  // Show traffic sign detections in image viewer
  showSignDetections(value) {
    this._mlyShowSignDetections = value;
    if (!this._mlyShowFeatureDetections && !this._mlyShowSignDetections) {
      this.resetTags();
    }
  }


  // Apply filter to image viewer
  filterViewer() {
    const photoSystem = this.context.systems.photos;
    const showsPano = photoSystem.showsPanoramic;
    const showsFlat = photoSystem.showsFlat;
    const fromDate = photoSystem.fromDate;
    const toDate = photoSystem.toDate;
    const filter = ['all'];

    if (!showsPano) filter.push([ '!=', 'cameraType', 'spherical' ]);
    if (!showsFlat && showsPano) filter.push(['==', 'pano', true]);
    if (fromDate) {
      filter.push(['>=', 'capturedAt', new Date(fromDate).getTime()]);
    }
    if (toDate) {
      filter.push(['>=', 'capturedAt', new Date(toDate).getTime()]);
    }

    if (this._mlyViewer) {
      this._mlyViewer.setFilter(filter);
    }
    this._mlyViewerFilter = filter;

    return filter;
  }


  // Make the image viewer visible
  showViewer() {
    const wrap = this.context.container().select('.photoviewer')
      .classed('hide', false);

    const isHidden = wrap.selectAll('.photo-wrapper.mly-wrapper.hide').size();

    if (isHidden && this._mlyViewer) {
      wrap
        .selectAll('.photo-wrapper:not(.mly-wrapper)')
        .classed('hide', true);

      wrap
        .selectAll('.photo-wrapper.mly-wrapper')
        .classed('hide', false);

      this._mlyViewer.resize();
    }

    return this;
  }


  // Hide the image viewer and resets map markers
  hideViewer() {
    this._mlyActiveImage = null;
    const context = this.context;
    context.systems.photos.selectPhoto(null);

    if (!this._mlyFallback && this._mlyViewer) {
      this._mlyViewer.getComponent('sequence').stop();
    }

    const viewer = context.container().select('.photoviewer');
    if (!viewer.empty()) viewer.datum(null);

    viewer
      .classed('hide', true)
      .selectAll('.photo-wrapper')
      .classed('hide', true);

    this.emit.call('imageChanged');

    return this.setStyles(context, null);
  }


  // Highlight the detection in the viewer that is related to the clicked map feature
  highlightDetection(detection) {
    if (detection) {
      this._mlyHighlightedDetection = detection.id;
    }
    return this;
  }


  // Initialize image viewer (Mapillary JS)
  initViewer() {
    const mapillary = window.mapillary;
    if (!mapillary) return;

    const context = this.context;

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
      this._mlyFallback = true;
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

    // imageChanged: called after the viewer has changed images and is ready.
    const imageChanged = (node) => {
      this.resetTags();
      const image = node.image;
      this.setActiveImage(image);
      this.setStyles(context, null);
      const loc = [image.originalLngLat.lng, image.originalLngLat.lat];
      context.systems.map.centerEase(loc);
      context.systems.photos.selectPhoto('mapillary', image.id);

      if (this._mlyShowFeatureDetections || this._mlyShowSignDetections) {
        this.updateDetections(image.id, `${apiUrl}/${image.id}/detections?access_token=${accessToken}&fields=id,image,geometry,value`);
      }
      this.emit.call('imageChanged');
    };

    // bearingChanged: called when the bearing changes in the image viewer.
    const bearingChanged = (e) => {
      this.emit.call('bearingChanged', undefined, e);
    };

    this._mlyViewer = new mapillary.Viewer(opts);
    this._mlyViewer.on('image', imageChanged);
    this._mlyViewer.on('bearing', bearingChanged);

    if (this._mlyViewerFilter) {
      this._mlyViewer.setFilter(this._mlyViewerFilter);
    }

    // Register viewer resize handler
    context.systems.ui.photoviewer.on('resize.mapillary', () => {
      if (this._mlyViewer) this._mlyViewer.resize();
    });
  }


  // Move to an image
  // note: call `photoSystem.selectPhoto(layerID, photoID)` instead
  // That will deal with the URL and call this function
  selectImage(imageID) {
    if (this._mlyViewer && imageID) {
      this._mlyViewer
        .moveTo(imageID)
        .catch(err => console.error('mly3', err));   // eslint-disable-line no-console
    }
    return this;
  }


  // Return the currently displayed image
  getActiveImage() {
    return this._mlyActiveImage;
  }


  // Return a list of detection objects for the given id
  getDetections(id) {
    return this._loadDataAsync(`${apiUrl}/${id}/detections?access_token=${accessToken}&fields=id,value,image`);
  }


  // Set the currently visible image
  setActiveImage(image) {
    if (image) {
      this._mlyActiveImage = {
        ca: image.originalCompassAngle,
        id: image.id,
        loc: [image.originalLngLat.lng, image.originalLngLat.lat],
        isPano: image.cameraType === 'spherical',
        sequenceID: image.sequenceID
      };
    } else {
      this._mlyActiveImage = null;
    }
  }


  // Update the currently highlighted sequence and selected bubble.
  setStyles(context, hovered) {
    const hoveredImageID = hovered?.id;
    const hoveredSequenceID = hovered?.sequenceID;
    const selectedSequenceID = this._mlyActiveImage && this._mlyActiveImage.sequenceID;

    context.container().selectAll('.layer-mapillary .viewfield-group')
      .classed('highlighted', function(d) { return (d.sequenceID === selectedSequenceID) || (d.id === hoveredImageID); })
      .classed('hovered', function(d) { return d.id === hoveredImageID; });

    context.container().selectAll('.layer-mapillary .sequence')
      .classed('highlighted', function(d) { return d.properties.id === hoveredSequenceID; })
      .classed('currentView', function(d) { return d.properties.id === selectedSequenceID; });

    return this;
  }


  // Get detections for the current image and shows them in the image viewer
  updateDetections(imageID, url) {
    if (!this._mlyViewer || this._mlyFallback) return;
    if (!imageID) return;

    const cache = this._mlyCache.image_detections;
    let detections = cache.forImageID[imageID];

    if (detections) {
      this._showDetections(detections);
    } else {
      this._loadDataAsync(url)
        .then(results => {
          for (const result of results) {
            if (!cache.forImageID[imageID]) {
              cache.forImageID[imageID] = [];
            }
            cache.forImageID[imageID].push({
              id: result.id,
              geometry: result.geometry,
              image_id: imageID,
              value: result.value
            });
          }

          this._showDetections(cache.forImageID[imageID] || []);
        });
    }
  }

  // Create a tag for each detection and shows it in the image viewer
  _showDetections(detections) {
    const tagComponent = this._mlyViewer.getComponent('tag');
    for (const data of detections) {
      const tag = this._makeTag(data);
      if (tag) {
        tagComponent.add([tag]);
      }
    }
  }

    // Create a Mapillary JS tag object
  _makeTag(data) {
    const valueParts = data.value.split('--');
    if (!valueParts.length) return;

    let tag;
    let text;
    let color = 0xffffff;

    if (this._mlyHighlightedDetection === data.id) {
      color = 0xffff00;
      text = valueParts[1];
      if (text === 'flat' || text === 'discrete' || text === 'sign') {
        text = valueParts[2];
      }
      text = text.replace(/-/g, ' ');
      text = text.charAt(0).toUpperCase() + text.slice(1);
      this._mlyHighlightedDetection = null;
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

    const mapillary = window.mapillary;
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


  // Load all data for the specified type from Mapillary vector tiles
  _loadTiles(which, url, maxZoom, projection) {
    // determine the needed tiles to cover the view
    const tiles = this._tiler.zoomRange(minZoom, maxZoom).getTiles(projection).tiles;
    for (const tile of tiles) {
      this._loadTile(which, url, tile);
    }
  }


  // Load all data for the specified type from one vector tile
  _loadTile(which, url, tile) {
    const cache = this._mlyCache.requests;
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

        this._loadTileDataToCache(data, tile);

        this.context.deferredRedraw();
        if (which === 'images') {
          this.emit.call('loadedImages');
        } else if (which === 'signs') {
          this.emit.call('loadedSigns');
        } else if (which === 'points') {
          this.emit.call('loadedMapFeatures');
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
  _loadTileDataToCache(data, tile) {
    const vectorTile = new VectorTile(new Protobuf(data));

    if (vectorTile.layers.hasOwnProperty('image')) {
      const cache = this._mlyCache.images;
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
      const cache = this._mlyCache.sequences;
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
      const cache = this._mlyCache.points;
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
      const cache = this._mlyCache.signs;
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
  _loadDataAsync(url) {
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

}
