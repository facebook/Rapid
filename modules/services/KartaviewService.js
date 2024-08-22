import { zoom as d3_zoom, zoomIdentity as d3_zoomIdentity } from 'd3-zoom';
import { Tiler } from '@rapid-sdk/math';
import { utilQsString } from '@rapid-sdk/util';
import RBush from 'rbush';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { uiIcon } from '../ui/icon.js';
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

    this._hires = false;
    this._cache = {};
    this._startPromise = null;
    this._tiler = new Tiler().zoomRange(TILEZOOM).skipNullIsland(true);
    this._lastv = null;

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
    const ui = context.systems.ui;

    // add osc-wrapper
    const $wrapper = context.container().select('.photoviewer .middle-middle')
      .selectAll('.osc-wrapper')
      .data([0]);

    const $$wrapper = $wrapper.enter()
      .append('div')
      .attr('class', 'photo-wrapper osc-wrapper')
      .classed('hide', true)
      .call(this._imgZoom.on('zoom', this._zoomPan))
      .on('dblclick.zoom', null);

    // add .photo-footer
    const $$footer = $$wrapper
      .append('div')
      .attr('class', 'photo-footer');

    $$footer
      .append('div')
      .attr('class', 'photo-options');

    $$footer
      .append('div')
      .attr('class', 'photo-attribution');


    // add .photo-controls
    const $$controls = $$wrapper
      .append('div')
      .attr('class', 'photo-controls-wrap')
      .append('div')
      .attr('class', 'photo-controls');

    $$controls
      .append('button')
      .on('click.back', () => this._step(-1))
      .call(uiIcon('#fas-backward-step'));

    $$controls
      .append('button')
      .on('click.rotate-ccw', () => this._rotate(-90))
      .call(uiIcon('#fas-arrow-rotate-left'));

    $$controls
      .append('button')
      .on('click.rotate-cw', () => this._rotate(90))
      .call(uiIcon('#fas-arrow-rotate-right'));

    $$controls
      .append('button')
      .on('click.forward', () => this._step(1))
      .call(uiIcon('#fas-forward-step'));

    $$wrapper
      .append('div')
      .attr('class', 'osc-image-wrap');


    // Register viewer resize handler
    ui.photoviewer.on('resize', dimensions => {
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
      inflight:  new Map(),   // Map(k, {Promise, AbortController})
      loaded:    new Set(),   // Set(k)  (where k is like `${tile.id},${nextPage}`)
      nextPage:  new Map(),   // Map(tileID, Number)
      images:    new Map(),   // Map(imageID, image data)
      sequences: new Map(),   // Map(sequenceID, sequence data)
      rbush:     new RBush()
    };

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
    return this._cache.rbush.search(extent.bbox()).map(d => d.data);
  }


  /**
   * getSequences
   * Get already loaded sequence data that appears in the current map view
   * @return  {Array}  Array of sequence data
   */
  getSequences() {
    const extent = this.context.viewport.visibleExtent();
    const sequenceIDs = new Set();

    // Gather sequences for images in viewport
    for (const box of this._cache.rbush.search(extent.bbox())) {
      if (box.data.sequenceID) {
        sequenceIDs.add(box.data.sequenceID);
      }
    }

    // Make GeoJSON LineStrings from those sequences..
    const lineStrings = [];
    for (const sequenceID of sequenceIDs) {
      const sequence = this._cache.sequences.get(sequenceID);
      if (!sequence) continue;

      const images = sequence?.images ?? [];   // note that `images` may be a sparse array
      if (!images.length) continue;

      const first = images.find(i => i);  // find any image

      lineStrings.push({
        type: 'LineString',
        properties: {
          type: 'sequence',
          id: sequenceID,
          v:  sequence.v,
          isPano:      first.isPano,
          captured_at: first.captured_at,
          captured_by: first.captured_by
        },
        coordinates: images.map(i => i.loc).filter(Boolean)
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
      this._loadNextTilePageAsync(tile);
    }
  }


  /**
   * showViewer
   * Shows the photo viewer, and hides all other photo viewers
   */
  showViewer() {
    const $viewer = this.context.container().select('.photoviewer')
      .classed('hide', false);

    const isHidden = $viewer.selectAll('.photo-wrapper.osc-wrapper.hide').size();

    if (isHidden) {
      $viewer
        .selectAll('.photo-wrapper:not(.osc-wrapper)')
        .classed('hide', true);

      $viewer
        .selectAll('.photo-wrapper.osc-wrapper')
        .classed('hide', false);
    }
  }


  /**
   * hideViewer
   * Hides the photo viewer and clears the currently selected image
   */
  hideViewer() {
    const context = this.context;
    context.systems.photos.selectPhoto(null);

    const $viewer = context.container().select('.photoviewer');
    $viewer
      .classed('hide', true)
      .selectAll('.photo-wrapper')
      .classed('hide', true);

    this.emit('imageChanged');
  }


  /**
   * selectImageAsync
   * Note:  most code should call `PhotoSystem.selectPhoto(layerID, photoID)` instead.
   * That will manage the state of what the user clicked on, and then call this function.
   * @param  {string} imageID - the id of the image to select
   * @return {Promise} Promise that resolves to the image after it has been selected
   */
  selectImageAsync(imageID) {
    if (!imageID) {
      this._updatePhotoFooter(null);  // reset
      return Promise.resolve();  // do nothing
    }

    const context = this.context;
    const cache = this._cache;

    return this.startAsync()
      .then(() => this._loadImageAsync(imageID))
      .then(image => {
        const $wrapper = context.container().select('.photoviewer .osc-wrapper');
        const $imageWrap = $wrapper.selectAll('.osc-image-wrap');

        $wrapper
          .transition()
          .duration(100)
          .call(this._imgZoom.transform, d3_zoomIdentity);

        $imageWrap
          .selectAll('.osc-image')
          .remove();

        const sequence = cache.sequences.get(image.sequenceID);
        const r = sequence?.rotation ?? 0;

        $imageWrap
          .append('img')
          .attr('class', 'osc-image')
          .attr('src', this._hires ? image.imageHighUrl : image.imageMedUrl)
          .style('transform', `rotate(${r}deg)`);

        this._updatePhotoFooter(image.id);

        return image;  // pass the image to anything that chains off this Promise
      });
  }


  /**
   * _updatePhotoFooter
   * Update the photo attribution section of the image viewer
   * @param  {string} imageID - the new imageID
   */
  _updatePhotoFooter(imageID) {
    const context = this.context;
    const l10n = context.systems.l10n;
    const photos = context.systems.photos;
    const $wrapper = context.container().select('.photoviewer .osc-wrapper');

    // Options Section
    const $options = $wrapper.selectAll('.photo-options');

    // .hires checkbox
    let $label = $options.selectAll('.hires')
      .data([0]);

    // enter
    const $$label = $label.enter()
      .append('label')
      .attr('for', 'osc-hires-input')
      .attr('class', 'hires');

    $$label
      .append('input')
      .attr('type', 'checkbox')
      .attr('id', 'osc-hires-input')
      .on('click', e => {
        e.stopPropagation();

        this._hires = !this._hires;
        this.selectImageAsync(photos.currPhotoID);  // reselect
      });

    $$label
      .append('span');

    // update
    $label = $label.merge($$label);
    $label.selectAll('#osc-hires-input')
      .property('checked', this._hires);

    $label.selectAll('span')
      .text(l10n.t('photos.hires'));


    // Attribution Section
    const $attribution = $wrapper.selectAll('.photo-attribution').html('&nbsp;');  // clear DOM content

    const image = this._cache.images.get(imageID);
    if (!image) return;

    if (image.captured_by) {
      $attribution
        .append('span')
        .attr('class', 'captured_by')
        .text(image.captured_by);

      $attribution
        .append('span')
        .text('|');
    }

    if (image.captured_at) {
      $attribution
        .append('span')
        .attr('class', 'captured_at')
        .text(_localeDateString(image.captured_at));

      $attribution
        .append('span')
        .text('|');
    }

    $attribution
      .append('a')
      .attr('class', 'image-link')
      .attr('target', '_blank')
      .attr('href', `https://kartaview.org/details/${image.sequenceID}/${image.sequenceIndex}/track-info`)
      .text('kartaview.org');


    function _localeDateString(s) {
      if (!s) return null;
      const options = { day: 'numeric', month: 'short', year: 'numeric' };
      const d = new Date(s);
      if (isNaN(d.getTime())) return null;

      const localeCode = context.systems.l10n.localeCode();
      return d.toLocaleDateString(localeCode, options);
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
    if (z < 15) return 2;
    if (z < 16) return 5;
    if (z < 17) return 10;
    if (z < 18) return 20;
    if (z < 19) return 40;
    return 80;
  }


  /**
   * _loadNextTilePageAsync
   * Load the next page of image data for the given tile.
   * This uses `https://kartaview.org/1.0/list/nearby-photos/`
   * @param  {Tile}  tile - tile object
   * @return {Promise} Promise resolved when there is nothing more to do
   */
  _loadNextTilePageAsync(tile) {
    const context = this.context;
    const cache = this._cache;
    const bbox = tile.wgs84Extent.bbox();
    const currZoom = context.viewport.transform.zoom;
    const maxPages = this._maxPageAtZoom(currZoom);
    const nextPage = cache.nextPage.get(tile.id) ?? 1;

    if (nextPage > maxPages) return Promise.resolve();

    const k = `${tile.id},${nextPage}`;
    if (cache.loaded.has(k) || cache.inflight.has(k)) return Promise.resolve();

    const params = utilQsString({
      ipp: MAXRESULTS,
      page: nextPage,
      bbTopLeft: [bbox.maxY, bbox.minX].join(','),
      bbBottomRight: [bbox.minY, bbox.maxX].join(','),
    }, true);

    const controller = new AbortController();
    const url = `${KARTAVIEW_API}/1.0/list/nearby-photos/`;
    const options = {
      method: 'POST',
      signal: controller.signal,
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    };

    const prom = fetch(url, options)
      .then(utilFetchResponse)
      .then(response => {
        cache.loaded.add(k);
        const data = response?.currentPageItems || [];
        if (!data.length) return;

        // Process and cache the images
        for (const d of data) {
          const imageID = d.id.toString();
          const sequenceID = d.sequence_id.toString();

          // Note that this API call gives us the `username`, but not the image urls.
          // It also uses 'snake_case' instead of 'camelCase'.
          const image = this._cacheImage(cache, {
            id:            imageID,
            sequenceID:    sequenceID,
            loc:           [+d.lng, +d.lat],
            ca:            +d.heading,
            isPano:        (d.field_of_view === '360'),
            captured_by:   d.username,
            captured_at:   (d.shot_date || d.date_added),
            sequenceIndex: +d.sequence_index
          });

          // Cache sequence, create if needed
          let sequence = cache.sequences.get(sequenceID);
          if (!sequence) {
            sequence = {
              type: 'sequence',
              id: sequenceID,
              rotation: 0,
              images: [],
              v: 0
            };
            cache.sequences.set(sequenceID, sequence);
          }

          // Add image to sequence - note that `sequence.images` may be a sparse array.
          sequence.images[image.sequenceIndex] = image;
          sequence.v++;
        }

        context.deferredRedraw();
        this.emit('loadedData');

        if (data.length === MAXRESULTS) {
          cache.nextPage.set(tile.id, nextPage + 1);
          this._loadNextTilePageAsync(tile);
        } else {
          cache.nextPage.set(tile.id, Infinity);   // loaded all available pages for this tile
        }
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        if (err instanceof Error) console.error(err);  // eslint-disable-line no-console
      })
      .finally(() => {
        cache.inflight.delete(k);
      });

    cache.inflight.set(k, { promise: prom, controller: controller });
    return prom;
  }


  /**
   * _loadImageAsync
   * Load a single image.
   * This uses `https://api.openstreetcam.org/2.0/photo/<imageID>`
   * If the image has not yet been fetched (for example if we are loading an image
   *  specified in the urlhash and we haven't loaded tiles yet) we will cache the image data also.
   * @param  {string}  imageID - the imageID to load
   * @return {Promise} Promise resolved with the image Object
   */
  _loadImageAsync(imageID) {
    const context = this.context;
    const cache = this._cache;

    // If the image is already cached with an imageUrl, we can just resolve.
    const image = cache.images.get(imageID);
    if (image?.imageLowUrl) return Promise.resolve(image);  // fetched it already

    const url = `${OPENSTREETCAM_API}/2.0/photo/${imageID}`;

    return fetch(url)
      .then(utilFetchResponse)
      .then(response => {
        const d = response?.result?.data;
        if (!d) throw new Error(`Image ${imageID} not found`);

        const sequenceID = d.sequenceId.toString();

        // Note that this API call gives us the image urls, but not the `username`.
        // It also uses 'camelCase' instead of 'snake_case'.
        const image = this._cacheImage(cache, {
          id:            imageID,
          sequenceID:    sequenceID,
          loc:           [+d.lng, +d.lat],
          ca:            +d.heading,
          isPano:        (d.fieldOfView === '360'),
          captured_at:   (d.shotDate || d.dateAdded),
          sequenceIndex: +d.sequenceIndex,
          imageLowUrl:   d.imageThUrl,     // thumbnail
          imageMedUrl:   d.imageLthUrl,    // large thumbnail
          imageHighUrl:  d.imageProcUrl    // full resolution
        });

        // Cache sequence, create if needed
        let sequence = cache.sequences.get(sequenceID);
        if (!sequence) {
          sequence = {
            type: 'sequence',
            id: sequenceID,
            rotation: 0,
            images: [],
            v: 0
          };
          cache.sequences.set(sequenceID, sequence);
        }

        // Add image to sequence - note that `sequence.images` may be a sparse array.
        sequence.images[image.sequenceIndex] = image;
        sequence.v++;

        context.deferredRedraw();
        this.emit('loadedData');

        return image;
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
    const context = this.context;
    const photos = context.systems.photos;

    const image = this._cache.images.get(photos.currPhotoID);
    if (!image) return;

    const sequence = this._cache.sequences.get(image.sequenceID);
    if (!sequence) return;

    let r = sequence.rotation || 0;
    r += deg;

    if (r > 180) r -= 360;
    if (r < -180) r += 360;
    sequence.rotation = r;

    const $wrapper = context.container().select('.photoviewer .osc-wrapper');

    $wrapper
      .transition()
      .duration(100)
      .call(this._imgZoom.transform, d3_zoomIdentity);

    $wrapper.selectAll('.osc-image')
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
    const context = this.context;
    const photos = context.systems.photos;

    const image = this._cache.images.get(photos.currPhotoID);
    if (!image) return;

    const sequence = this._cache.sequences.get(image.sequenceID);
    if (!sequence) return;

    const nextIndex = image.sequenceIndex + stepBy;
    const nextImage = sequence.images[nextIndex];
    if (!nextImage) return;

    photos.selectPhoto('kartaview', nextImage.id);

    this.emit('imageChanged');
  }


  /**
   * _cacheImage
   * Store the given image in the caches
   * @param  {Object}  cache - the cache to use
   * @param  {Object}  props - the image properties
   * @return {Object}  The image
   */
  _cacheImage(cache, props) {
    let image = cache.images.get(props.id);
    if (!image) {
      image = {
        type:    'photo',
        service: 'kartaview',
        id:      props.id,
        loc:     props.loc
      };

      cache.images.set(image.id, image);

      const [x, y] = props.loc;
      cache.rbush.insert({ minX: x, minY: y, maxX: x, maxY: y, data: image });
    }

    // Update whatever additional props we were passed..
    if (props.sequenceID)     image.sequenceID     = props.sequenceID;
    if (props.sequenceIndex)  image.sequenceIndex  = props.sequenceIndex;
    if (props.captured_at)    image.captured_at    = props.captured_at;
    if (props.captured_by)    image.captured_by    = props.captured_by;
    if (props.ca)             image.ca             = props.ca;
    if (props.isPano)         image.isPano         = props.isPano;
    if (props.imageLowUrl)    image.imageLowUrl    = props.imageLowUrl;   // thumbnail
    if (props.imageMedUrl)    image.imageMedUrl    = props.imageMedUrl;   // large thumbnail
    if (props.imageHighUrl)   image.imageHighUrl   = props.imageHighUrl;  // full resolution

    return image;
  }

}
