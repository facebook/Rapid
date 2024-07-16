import { select as d3_select } from 'd3-selection';
import { Tiler } from '@rapid-sdk/math';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import RBush from 'rbush';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { utilFetchResponse } from '../util/index.js';

const accessToken = 'MLY|3376030635833192|f13ab0bdf6b2f7b99e0d8bd5868e1d88';
const apiUrl = 'https://graph.mapillary.com/';
const baseTileUrl = 'https://tiles.mapillary.com/maps/vtp';
const imageTileUrl = `${baseTileUrl}/mly1_public/2/{z}/{x}/{y}?access_token=${accessToken}`;
const mapFeatureTileUrl = `${baseTileUrl}/mly_map_feature_point/2/{z}/{x}/{y}?access_token=${accessToken}`;
const trafficSignTileUrl = `${baseTileUrl}/mly_map_feature_traffic_sign/2/{z}/{x}/{y}?access_token=${accessToken}`;

const TILEZOOM = 14;


/**
 * `MapillaryService`
 * Events available:
 *   `imageChanged`
 *   `bearingChanged`
 *   `loadedImages`
 *   `loadedSigns`
 *   `loadedMapFeatures`
 */
export class MapillaryService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'mapillary';

    this._loadPromise = null;
    this._startPromise = null;

    this._showing = null;
    this._mlyActiveImage = null;
    this._mlyCache = {};
    this._mlyIsFallback = false;
    this._mlyHighlightedDetection = null;
    this._mlyShowFeatureDetections = false;
    this._mlyShowSignDetections = false;
    this._mlyViewer = null;
    this._mlyViewerFilter = ['all'];
    this._keydown = this._keydown.bind(this);
    this.navigateForward = this.navigateForward.bind(this);
    this.navigateBackward = this.navigateBackward.bind(this);

    this._tiler = new Tiler().zoomRange(TILEZOOM).skipNullIsland(true);
    this._lastv = null;
  }


  /**
   * _keydown
   * Handler for keydown events on the window, but only if the photo viewer is visible.
   * @param  `e`  A DOM KeyboardEvent
   */
  _keydown(e) {
    // Only allow key navigation if the user doesn't have something
    // more important focused - like a input, textarea, menu, etc.
    // and only allow key nav if we're showing the viewer and have the body or the map clicked
    const activeElement = document.activeElement?.tagName ?? 'BODY';
    const mapillaryViewerClass = document.activeElement?.className.startsWith('mapillary');

    if (
      (activeElement !== 'BODY' && !mapillaryViewerClass) ||
      !this.viewerShowing      ||
      !this.context.systems.photos._currLayerID?.startsWith('mapillary')
    ) {
      return;
    }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        this.navigateBackward();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        this.navigateForward();
      }
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
    if (this._startPromise) return this._startPromise;

    const context = this.context;

    // add mly-wrapper
    const wrap = context.container().select('.photoviewer')
      .selectAll('.mly-wrapper')
      .data([0]);

    wrap.enter()
      .append('div')
      .attr('id', 'rapideditor-mly')
      .attr('class', 'photo-wrapper mly-wrapper')
      .classed('hide', true);

    const eventManager = this.context.systems.map.renderer.events;
    eventManager.on('keydown', this._keydown);

    return this._startPromise = this._loadAssetsAsync()
      .then(() => this._initViewer())
      .then(() => this._started = true)
      .catch(err => {
        if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
        this._startPromise = null;
      });
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
      signs:  { rtree: new RBush() },
      points: { rtree: new RBush() },
      sequences: new Map(),    // Map(sequenceID -> Array of LineStrings)
      image_detections: { forImageID: {} },
      requests: { loaded: {}, inflight: {} }
    };

    this._mlyActiveImage = null;
    this._lastv = null;

    return Promise.resolve();
  }


  /**
   * getData
   * Get already loaded data that appears in the current map view
   * @param   {string}  datasetID - one of 'images', 'signs', or 'points'
   * @return  {Array}
   */
  getData(datasetID) {
    if (!['images', 'signs', 'points'].includes(datasetID)) return [];

    const extent = this.context.viewport.visibleExtent();
    const cache = this._mlyCache[datasetID];
    return cache.rtree.search(extent.bbox()).map(d => d.data);
  }


  /**
   * getSequences
   * Get already loaded sequence data that appears in the current map view
   * @return  {Array}
   */
  getSequences() {
    const extent = this.context.viewport.visibleExtent();
    let result = new Map();  // Map(sequenceID -> Array of LineStrings)

    for (const box of this._mlyCache.images.rtree.search(extent.bbox())) {
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


  /**
   * loadTiles
   * Schedule any data requests needed to cover the current map view
   * @param   {string}  datasetID - one of 'images', 'signs', or 'points'
   */
  loadTiles(datasetID) {
    if (!['images', 'signs', 'points'].includes(datasetID)) return;

    const viewport = this.context.viewport;
    if (this._lastv === viewport.v) return;  // exit early if the view is unchanged
    this._lastv = viewport.v;

    // Determine the tiles needed to cover the view..
    const tiles = this._tiler.getTiles(viewport).tiles;
    for (const tile of tiles) {
      this._loadTile(datasetID, tile);
    }
  }


  /**
   * resetTags
   * Remove highlghted detections from the Mapillary viewer
   */
  resetTags() {
    if (this._mlyViewer && !this._mlyIsFallback) {
      this._mlyViewer.getComponent('tag').removeAll();
    }
  }


  /**
   * showFeatureDetections
   * Show highlghted detections in the Mapillary viewer
   * @param  {Boolean}  `true` to show them, `false` to hide them
   */
  showFeatureDetections(value) {
    this._mlyShowFeatureDetections = value;
    if (!this._mlyShowFeatureDetections && !this._mlyShowSignDetections) {
      this.resetTags();
    }
  }

  /**
   * showSignDetections
   * Show highlghted traffic signs in the Mapillary viewer
   * @param  {Boolean}  `true` to show them, `false` to hide them
   */
  showSignDetections(value) {
    this._mlyShowSignDetections = value;
    if (!this._mlyShowFeatureDetections && !this._mlyShowSignDetections) {
      this.resetTags();
    }
  }


  /**
   * filterViewer
   * Apply filters to the Mapillary viewer
   * The filters settings are stored in the PhotoSystem
   */
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

navigateForward() {
  const next = window.mapillary.NavigationDirection.Next;
  this._navigate(next);
}

navigateBackward() {
  const prev = window.mapillary.NavigationDirection.Prev;
  this._navigate(prev);
}

  _navigate(dir) {
    this._mlyViewer.moveDir(dir).catch(
      error => { //errs out if end of sequence reached, just don't print anything
      },
    );
}

get viewerShowing()         { return this._showing; }


  /**
   * showViewer
   * Shows the photo viewer, and hides all other photo viewers
   */
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

      this._showing = true;

      this._mlyViewer.resize();
    }
  }


  /**
   * hideViewer
   * Hides the photo viewer and clears the currently selected image
   */
  hideViewer() {
    this._mlyActiveImage = null;
    const context = this.context;
    context.systems.photos.selectPhoto(null);

    if (!this._mlyIsFallback && this._mlyViewer) {
      this._mlyViewer.getComponent('sequence').stop();
    }

    const viewer = context.container().select('.photoviewer');
    if (!viewer.empty()) viewer.datum(null);

    viewer
      .classed('hide', true)
      .selectAll('.photo-wrapper')
      .classed('hide', true);

    this._showing = false;

    this.setStyles(context, null);
    this.emit('imageChanged');
  }


  // Highlight the detection in the viewer that is related to the clicked map feature
  highlightDetection(detection) {
    if (detection) {
      this._mlyHighlightedDetection = detection.id;
    }
    return this;
  }


  /**
   * selectImageAsync
   * Note:  most code should call `PhotoSystem.selectPhoto(layerID, photoID)` instead.
   * That will manage the state of what the user clicked on, and then call this function.
   * @param  {string} imageID - the id of the image to select
   * @return {Promise} Promise that always resolves (we should change this to resolve after the image is ready)
   */
  selectImageAsync(imageID) {
    if (!imageID) return Promise.resolve();  // do nothing

    return this.startAsync()
      .then(() => {
        return this._mlyViewer
          .moveTo(imageID)
          .catch(err => console.error('mly3', err));   // eslint-disable-line no-console
      });
  }


  // Return the currently displayed image
  getActiveImage() {
    return this._mlyActiveImage;
  }


  // Return a list of detection objects for the given id
  getDetectionsAsync(id) {
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


  // NOTE: the setStyles() functions all dont work right now since the WebGL rewrite.
  // They depended on selecting svg stuff from the container - see #740

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
  }


  // Get detections for the current image and shows them in the image viewer
  updateDetections(imageID, url) {
    if (!this._mlyViewer || this._mlyIsFallback) return;
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


  // Load all data for the specified type from one vector tile
  _loadTile(datasetID, tile) {
    if (!['images', 'signs', 'points'].includes(datasetID)) return;

    const cache = this._mlyCache.requests;
    const tileID = `${tile.id}-${datasetID}`;
    if (cache.loaded[tileID] || cache.inflight[tileID]) return;

    const controller = new AbortController();
    cache.inflight[tileID] = controller;

    let url = {
      images: imageTileUrl,
      signs: trafficSignTileUrl,
      points: mapFeatureTileUrl
    }[datasetID];

    url = url
      .replace('{x}', tile.xyz[0])
      .replace('{y}', tile.xyz[1])
      .replace('{z}', tile.xyz[2]);

    fetch(url, { signal: controller.signal })
      .then(utilFetchResponse)
      .then(buffer => {
        cache.loaded[tileID] = true;
        if (!buffer) {
          throw new Error('No Data');
        }

        this._loadTileDataToCache(buffer, tile);

        this.context.deferredRedraw();
        if (datasetID === 'images') {
          this.emit('loadedImages');
        } else if (datasetID === 'signs') {
          this.emit('loadedSigns');
        } else if (datasetID === 'points') {
          this.emit('loadedMapFeatures');
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
  _loadTileDataToCache(buffer, tile) {
    const vectorTile = new VectorTile(new Protobuf(buffer));

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
          id: feature.properties.id.toString(),
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
      .then(utilFetchResponse)
      .then(result => {
        return result?.data || [];
      })
      .catch(err => {
        if (err.name === 'AbortError') return;          // ok
        if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
      });
  }


  /**
   * _loadAssetsAsync
   * Load the Mapillary JS and CSS files into the document head
   * @return {Promise} Promise resolved when both files have been loaded
   */
  _loadAssetsAsync() {
    if (this._loadPromise) return this._loadPromise;

    return this._loadPromise = new Promise((resolve, reject) => {
      const assets = this.context.systems.assets;

      let count = 0;
      const loaded = () => {
        if (++count === 2) resolve();
      };

      const head = d3_select('head');

      head.selectAll('#rapideditor-mapillary-css')
        .data([0])
        .enter()
        .append('link')
        .attr('id', 'rapideditor-mapillary-css')
        .attr('rel', 'stylesheet')
        .attr('crossorigin', 'anonymous')
        .attr('href', assets.getAssetURL('mapillary_css'))
        .on('load', loaded)
        .on('error', reject);

      head.selectAll('#rapideditor-mapillary-js')
        .data([0])
        .enter()
        .append('script')
        .attr('id', 'rapideditor-mapillary-js')
        .attr('crossorigin', 'anonymous')
        .attr('src', assets.getAssetURL('mapillary_js'))
        .on('load', loaded)
        .on('error', reject);
    });
  }


  // Initialize image viewer (Mapillary JS)
  _initViewer() {
    const mapillary = window.mapillary;
    if (!mapillary) throw new Error('mapillary not loaded');

    const context = this.context;

    const opts = {
      accessToken: accessToken,
      component: {
        cover: false,
        bearing: {size: mapillary.ComponentSize.Standard},
        keyboard: false,
        tag: true
      },
      container: 'rapideditor-mly',
    };

    // Disable components requiring WebGL support
    if (!mapillary.isSupported() && mapillary.isFallbackSupported()) {
      this._mlyIsFallback = true;
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
      this.emit('imageChanged');
    };

    // bearingChanged: called when the bearing changes in the image viewer.
    const bearingChanged = (e) => {
      this.emit('bearingChanged', e);
      this.context.systems.map.immediateRedraw();
    };

    const fovChange = (e) => {
      this.emit('fovChanged', e);
    };

    this._mlyViewer = new mapillary.Viewer(opts);
    this._mlyViewer.on('image', imageChanged);
    this._mlyViewer.on('bearing', bearingChanged);
    this._mlyViewer.on('fov', fovChange);


      if (this._mlyViewerFilter) {
      this._mlyViewer.setFilter(this._mlyViewerFilter);
    }

    // Register viewer resize handler
    context.systems.ui.photoviewer.on('resize.mapillary', () => {
      if (this._mlyViewer) this._mlyViewer.resize();
    });
  }


}
