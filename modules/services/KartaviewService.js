import { zoom as d3_zoom, zoomIdentity as d3_zoomIdentity } from 'd3-zoom';
import { Tiler } from '@rapid-sdk/math';
import { utilArrayUnion, utilQsString } from '@rapid-sdk/util';
import RBush from 'rbush';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { utilFetchResponse, utilSetTransform } from '../util/index.js';


const KARTAVIEW_API = 'https://kartaview.org';
const OPENSTREETCAM_API = 'https://api.openstreetcam.org';
const MAXRESULTS = 1000;
const TILEZOOM = 14;


/**
 * `KartaviewService`
 *
 * Events available:
 *   `imageChanged`
 *   `loadedData`
 */
export class KartaviewService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'kartaview';
    this.autoStart = false;

    this._imgZoom = d3_zoom()
      .extent([[0, 0], [320, 240]])
      .translateExtent([[0, 0], [320, 240]])
      .scaleExtent([1, 15]);

    this._cache = {};
    this._selectedImage = null;
    this._waitingForPhotoID = null;
    this._startPromise = null;
    this._tiler = new Tiler().zoomRange(TILEZOOM).skipNullIsland(true);
    this._lastv = null;
    this.fetchedSequences = new Set(); // Initialize an empty set

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._zoomPan = this._zoomPan.bind(this);
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

    // add osc-wrapper
    let wrap = context.container().select('.photoviewer').selectAll('.osc-wrapper')
      .data([0]);

    let wrapEnter = wrap.enter()
      .append('div')
      .attr('class', 'photo-wrapper osc-wrapper')
      .classed('hide', true)
      .call(this._imgZoom.on('zoom', this._zoomPan))
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
      .on('click.back', () => this._step(-1))
      .html('◄');

    controlsEnter
      .append('button')
      .on('click.rotate-ccw', () => this._rotate(-90))
      .html('⤿');

    controlsEnter
      .append('button')
      .on('click.rotate-cw', () => this._rotate(90))
      .html('⤾');

    controlsEnter
      .append('button')
      .on('click.forward', () => this._step(1))
      .html('►');

    wrapEnter
      .append('div')
      .attr('class', 'osc-image-wrap');


    // Register viewer resize handler
    context.systems.ui.photoviewer.on('resize.kartaview', dimensions => {
      this._imgZoom = d3_zoom()
        .extent([[0, 0], dimensions])
        .translateExtent([[0, 0], dimensions])
        .scaleExtent([1, 15])
        .on('zoom', this._zoomPan);
    });

    // don't need any async loading so resolve immediately
    this._started = true;
    return this._startPromise = Promise.resolve();
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    if (this._cache.inflight) {
      for (const inflight of this._cache.inflight.values()) {
        inflight.controller.abort();
      }
    }

    this._cache = {
      inflight:  new Map(),   // Map(k -> { Promise, AbortController})
      loaded:    new Set(),   // Set(k)   (where k is like `${tile.id},${nextPage}`)
      nextPage:  new Map(),   // Map(tileID -> Number)
      images:    new Map(),   // Map(imageID -> image data)
      sequences: new Map(),   // Map(sequenceID -> sequence data)
      rtree:     new RBush(),
    };

    this._selectedImage = null;
    this._lastv = null;

    return Promise.resolve();
  }


  /**
   * getImages
   * Get already loaded image data that appears in the current map view
   * @return  {Array}  Array of image data
   */
  getImages() {
    const extent = this.context.viewport.visibleExtent();
    return this._cache.rtree.search(extent.bbox()).map(d => d.data);
  }


  /**
   * getSequences
   * Get already loaded sequence data that appears in the current map view
   * @return  {Array}  Array of sequence data
   */
  getSequences() {
    const extent = this.context.viewport.visibleExtent();
    let sequenceIDs = new Set();

    // Gather sequences for images in viewport
    for (const box of this._cache.rtree.search(extent.bbox())) {
      if (box.data.sequenceID) {
        sequenceIDs.add(box.data.sequenceID);
      }
    }

    // Make GeoJSON LineStrings from those sequences..
    let lineStrings = [];
    for (const sequenceID of sequenceIDs) {
      const sequence = this._cache.sequences.get(sequenceID);
      const images = sequence?.images ?? [];   // note that `images` may be a sparse array
      if (!images.length) continue;

      lineStrings.push({
        type: 'LineString',
        properties: {
          id: sequenceID,
          v: sequence.v,
          captured_at: images[0]?.captured_at,
          captured_by: images[0]?.captured_by
        },
        coordinates: images.map(image => image.loc).filter(Boolean)
      });
    }
    return lineStrings;
  }


  /**
   * loadTiles
   * Schedule any data requests needed to cover the current map view
   */
  loadTiles() {
    const viewport = this.context.viewport;
    if (this._lastv === viewport.v) return;  // exit early if the view is unchanged
    this._lastv = viewport.v;

    // Determine the tiles needed to cover the view..
    const needTiles = this._tiler.getTiles(viewport).tiles;

    // Abort inflight requests that are no longer needed..
    for (const [k, inflight] of this._cache.inflight) {
      const needed = needTiles.find(tile => k.indexOf(tile.id) === 0);
      if (!needed) {
        inflight.controller.abort();
      }
    }

    // Fetch files that are needed
    for (const tile of needTiles) {
      this._loadNextTilePage(viewport.transform.zoom, tile);
    }
  }


  /**
   * showViewer
   * Shows the photo viewer, and hides all other photo viewers
   */
  showViewer() {
    let viewer = this.context.container().select('.photoviewer')
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
  }


  /**
   * hideViewer
   * Hides the photo viewer and clears the currently selected image
   */
  hideViewer() {
    this._selectedImage = null;
    const context = this.context;
    context.systems.photos.selectPhoto(null);

    let viewer = context.container().select('.photoviewer');
    if (!viewer.empty()) viewer.datum(null);

    viewer
      .classed('hide', true)
      .selectAll('.photo-wrapper')
      .classed('hide', true);

    context.container().selectAll('.viewfield-group, .sequence, .icon-sign')
      .classed('currentView', false);

    this.setStyles(context, null, true);
    this.emit('imageChanged');
  }


  /**
   * selectImageAsync
   * Note:  most code should call `PhotoSystem.selectPhoto(layerID, photoID)` instead.
   * That will manage the state of what the user clicked on, and then call this function.
   * @param  {string} imageID - the id of the image to select
   * @return {Promise} Promise that always resolves (we should change this to resolve after the image is ready)
   */
  selectImageAsync(imageID) {
    let d = this._cache.images.get(imageID);
    this._selectedImage = d;

    const context = this.context;
    if (!context.container()) return;

    let viewer = context.container().select('.photoviewer');
    if (!viewer.empty()) viewer.datum(d);

    this.setStyles(context, null, true);

    context.container().selectAll('.icon-sign')
      .classed('currentView', false);

    // It's possible we could be trying to show a photo that hasn't been fetched yet
    // (e.g. if we are starting up with a photoID specified in the url hash)
    if (imageID && !d) {
      this._waitingForPhotoID = imageID;
    }
    if (!d) return Promise.resolve();

    let wrap = context.container().select('.photoviewer .osc-wrapper');
    let imageWrap = wrap.selectAll('.osc-image-wrap');
    let attribution = wrap.selectAll('.photo-attribution').html('');

    wrap
      .transition()
      .duration(100)
      .call(this._imgZoom.transform, d3_zoomIdentity);

    imageWrap
      .selectAll('.osc-image')
      .remove();

    if (d) {
      const sequence = this._cache.sequences.get(d.sequenceID);
      const r = sequence?.rotation ?? 0;

      imageWrap
        .append('img')
        .attr('class', 'osc-image')
        .attr('src', `${KARTAVIEW_API}/${d.storageNum}/files/photo/${d.imagePath}`)
        .style('transform', `rotate(${r}deg)`);

      if (d.captured_at) {
        attribution
          .append('span')
          .attr('class', 'captured_at')
          .text(_localeDateString(d.captured_at));

        attribution
          .append('span')
          .text('|');
      }

      attribution
        .append('a')
        .attr('class', 'image-link')
        .attr('target', '_blank')
        .attr('href', `https://kartaview.org/details/${d.sequenceID}/${d.sequenceIndex}/track-info`)
        .text('kartaview.org');
    }

    return Promise.resolve();


    function _localeDateString(s) {
      if (!s) return null;
      const options = { day: 'numeric', month: 'short', year: 'numeric' };
      const d = new Date(s);
      if (isNaN(d.getTime())) return null;

      const localeCode = context.systems.l10n.localeCode();
      return d.toLocaleDateString(localeCode, options);
    }
  }


  // NOTE: the setStyles() functions all dont work right now since the WebGL rewrite.
  // They depended on selecting svg stuff from the container - see #740

  // Updates the currently highlighted sequence and selected bubble.
  // Reset is only necessary when interacting with the viewport because
  // this implicitly changes the currently selected bubble/sequence
  setStyles(context, hovered, reset) {
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
    let hoveredSequence = hoveredSequenceID && this._cache.sequences.get(hoveredSequenceID);
    let hoveredImageIDs = (hoveredSequence && hoveredSequence.images.map(function (d) { return d.id; })) || [];

    let viewer = context.container().select('.photoviewer');
    let selected = viewer.empty() ? undefined : viewer.datum();
    let selectedImageID = selected?.id;
    let selectedSequenceID = selected?.sequenceID;
    let selectedSequence = selectedSequenceID && this._cache.sequences.get(selectedSequenceID);
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
  }


  /**
   * _maxPageAtZoom
   * How many pages of data should we fetch at different zooms?
   * The idea is that the user can zoom in more to see more images.
   * @param  {Number} z - zoom level
   * @return {Number} max pages of data to fetch
   */
  _maxPageAtZoom(z) {
    if (z < 15)   return 2;
    if (z === 15) return 5;
    if (z === 16) return 10;
    if (z === 17) return 20;
    if (z === 18) return 40;
    if (z > 18)   return 80;
  }


  /**
   * _loadNextTilePage
   * Loads more image data
   * @param  {Number} currZoom - current zoom level
   * @param  {Tile} tile - tile object
   */
  _loadNextTilePage(currZoom, tile) {
  const bbox = tile.wgs84Extent.bbox();
  const maxPages = this._maxPageAtZoom(currZoom);
  const nextPage = this._cache.nextPage.get(tile.id) ?? 1;

  if (nextPage > maxPages) return;

  const k = `${tile.id},${nextPage}`;
  if (this._cache.loaded.has(k) || this._cache.inflight.has(k)) return;

  const params = utilQsString({
    ipp: MAXRESULTS,
    page: nextPage,
    bbTopLeft: [bbox.maxY, bbox.minX].join(','),
    bbBottomRight: [bbox.minY, bbox.maxX].join(','),
  }, true);

  const controller = new AbortController();
  const options = {
    method: 'POST',
    signal: controller.signal,
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  };
  const url = `${KARTAVIEW_API}/1.0/list/nearby-photos/`;

  fetch(url, options)
    .then(utilFetchResponse)
    .then(sequenceData => {
      this._cache.loaded.add(k);
      if (!sequenceData || !sequenceData.currentPageItems || !sequenceData.currentPageItems.length) {
        throw new Error('No Data');
      }
      // Extract the sequence IDs from the data
      const sequenceIDs = sequenceData.currentPageItems.map(image => image.sequence_id);

      // Fetch images for each sequence
      sequenceIDs.forEach(sequenceID => {
        this._fetchImagesForSequence(sequenceID);
      });

      if (sequenceData.currentPageItems.length === MAXRESULTS) {
        this._cache.nextPage.set(tile.id, nextPage + 1);
        this._loadNextTilePage(currZoom, tile);
      } else {
        this._cache.nextPage.set(tile.id, Infinity);
      }

      this.context.deferredRedraw();
      this.emit('loadedData');
    })
    .catch(err => {
      if (err.name === 'AbortError') return;
      if (err instanceof Error) console.error(err);  // eslint-disable-line no-console
    })
    .finally(() => {
      this._cache.inflight.delete(k);
    });

  this._cache.inflight.set(k, { promise: null, controller: controller });
}

_fetchImagesForSequence(sequenceID) {
  if (!sequenceID) {
    console.error('Invalid sequenceID:', sequenceID);   // eslint-disable-line no-console
    return; // Abort the operation if sequenceID is not defined
  }

  if (this.fetchedSequences.has(sequenceID)) {
    return; // Sequence already fetched
  }

  // Add the sequence to the fetched set to avoid duplicate fetching
  this.fetchedSequences.add(sequenceID);
  const controller = new AbortController();
  const sequenceUrl = `${OPENSTREETCAM_API}/2.0/photo/?sequenceId=${sequenceID}`;
  const sequenceOptions = {
    method: 'GET',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  };
  fetch(sequenceUrl, sequenceOptions)
    .then(utilFetchResponse)
    .then(data => {
      if (data && data.result && data.result.data) {
        // Process and cache the images
        const imageBoxes = data.result.data.map(image => {
          const loc = [+image.lng, +image.lat];
          const d = {
            id: image.id,
            loc: loc,
            ca: +image.heading,
            captured_at: (image.shotDate || image.dateAdded),
            storageNum: image.storage,
            imagePath: image.filepathLTh,
            sequenceID: image.sequenceId,
            sequenceIndex: +image.sequenceIndex
          };
          this._cache.images.set(image.id, d);

          // Cache sequence info
          let sequence = this._cache.sequences.get(d.sequenceID);
          if (!sequence) {
            sequence = { rotation: 0, images: [], v: 0 };
            this._cache.sequences.set(d.sequenceID, sequence);
          }

          // Add image to sequence - note that `images` may be a sparse array
          sequence.images[d.sequenceIndex] = d;
          sequence.v++;

          return {
            minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1], data: d
          };
        }).filter(Boolean);

        this._cache.rtree.load(imageBoxes);
      }
    })
    .catch(err => {
      if (err instanceof Error) console.error(err);  // eslint-disable-line no-console
    });
  }


  /**
   * _zoomPan
   * Handler for zoom/pan events in the viewer.
   * The user can drag and zoom in on the image.
   * @param  {Event}  d3_event
   */
  _zoomPan(d3_event) {
    const t = d3_event.transform;
    this.context.container().select('.photoviewer .osc-image-wrap')
      .call(utilSetTransform, t.x, t.y, t.k);
  }


  /**
   * _rotate
   * Rotate the sequence in the viewer.
   * The user can press buttons to rotate the image if it has been recorded sideways.
   * @param  {Number}  deg - degrees to rotate
   */
  _rotate(deg) {
    if (!this._selectedImage) return;

    const sequenceID = this._selectedImage.sequenceID;
    const sequence = this._cache.sequences.get(sequenceID);
    if (!sequence) return;

    let r = sequence.rotation || 0;
    r += deg;

    if (r > 180) r -= 360;
    if (r < -180) r += 360;
    sequence.rotation = r;

    let wrap = this.context.container().select('.photoviewer .osc-wrapper');

    wrap
      .transition()
      .duration(100)
      .call(this._imgZoom.transform, d3_zoomIdentity);

    wrap.selectAll('.osc-image')
      .transition()
      .duration(100)
      .style('transform', `rotate(${r}deg)`);
  }


  /**
   * _step
   * Step forward/backward along the sequence in the viewer.
   * @param  {Number}  stepBy - number to step by, either +1 or -1
   */
  _step(stepBy) {
    if (!this._selectedImage) return;

    const sequenceID = this._selectedImage.sequenceID;
    const sequence = this._cache.sequences.get(sequenceID);
    if (!sequence) return;

    const nextIndex = this._selectedImage.sequenceIndex + stepBy;
    const nextImage = sequence.images[nextIndex];
    if (!nextImage) return;

    const context = this.context;
    context.systems.map.centerEase(nextImage.loc);
    context.systems.photos.selectPhoto('kartaview', nextImage.id);
    this.emit('imageChanged');
  }
}

