import { dispatch as d3_dispatch } from 'd3-dispatch';
import { json as d3_json } from 'd3-fetch';
import { select as d3_select } from 'd3-selection';
import { timer as d3_timer } from 'd3-timer';
import { Extent, Tiler, geoMetersToLat, geoMetersToLon, geomRotatePoints, geomPointInPolygon, vecLength } from '@rapid-sdk/math';
import { utilArrayUnion, utilQsString, utilUniqueString } from '@rapid-sdk/util';
import RBush from 'rbush';

import { t, localizer } from '../core/localizer';
import { jsonpRequest } from '../util/jsonp_request';
import { utilRebind } from '../util';

const pannellumViewerCSS = 'pannellum-streetside/pannellum.css';
const pannellumViewerJS = 'pannellum-streetside/pannellum.js';
const TILEZOOM = 16.5;


/**
 * `ServiceStreetside`
 */
export class ServiceStreetside {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.id = 'streetside';
    this.context = context;

    this._hires = false;
    this._resolution = 512;    // higher numbers are slower - 512, 1024, 2048, 4096
    this._currScene = 0;
    this._cache = {};
    this._pannellumViewer = null;
    this._pannellumViewerPromise = null;

    this._sceneOptions = {
      showFullscreenCtrl: false,
      autoLoad: true,
      compass: true,
      yaw: 0,
      hfov: 45,      // default field of view degrees
      minHfov: 10,   // zoom in degrees:  20, 10, 5
      maxHfov: 90,   // zoom out degrees
      type: 'cubemap',
      cubeMap: []
    };

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this._setupCanvas = this._setupCanvas.bind(this);

    this._tiler = new Tiler().zoomRange(TILEZOOM).skipNullIsland(true);
    this._dispatch = d3_dispatch('loadedImages', 'viewerChanged');
    utilRebind(this, this._dispatch, 'on');
  }


  /**
   * init
   * Called one time after all core objects have been instantiated.
   */
  init() {
    this.reset();
  }


  /**
   * reset
   * Called after completing an edit session to reset any internal state
   */
  reset() {
    if (this._cache.inflight) {
      for (const inflight of this._cache.inflight.values()) {
        inflight.controller.abort();
      }
    }

    this._cache = {
      inflight:  new Map(),   // Map(tileID -> { Promise, AbortController})
      loaded:    new Set(),   // Set(tileID)
      bubbles:   new Map(),   // Map(bubbleID -> bubble data)
      sequences: new Map(),   // Map(sequenceID -> sequence data)
      rtree:     new RBush(),
      leaders:   [],
      metadataPromsie:  null
    };
  }


  /**
   * bubbles
   */
  bubbles(projection) {
    const viewport = projection.dimensions();
    const min = [viewport[0][0], viewport[1][1]];
    const max = [viewport[1][0], viewport[0][1]];
    const box = new Extent(projection.invert(min), projection.invert(max)).bbox();
    return this._cache.rtree.search(box).map(d => d.data);
  }


  cachedImage(bubbleID) {
    return this._cache.bubbles.get(bubbleID);
  }


  sequences(projection) {
    const viewport = projection.dimensions();
    const min = [viewport[0][0], viewport[1][1]];
    const max = [viewport[1][0], viewport[0][1]];
    const bbox = new Extent(projection.invert(min), projection.invert(max)).bbox();
    let result = new Map();  // Map(sequenceID -> sequence geojson)

    // Gather sequences for bubbles in viewport
    for (const box of this._cache.rtree.search(bbox)) {
      const sequenceID = box.data.sequenceID;
      if (!sequenceID) continue;  // no sequence for this bubble
      if (!result.has(sequenceID)) {
        result.set(sequenceID, this._cache.sequences.get(sequenceID).geojson);
      }
    }
    return [...result.values()];
  }


  /**
   * loadBubbles
   * by default: request 2 nearby tiles so we can connect sequences.
   */
  loadBubbles(projection, margin = 2) {
    this._loadTiles(projection, margin);
  }


  viewer() {
    return this._pannellumViewer;
  }


  initViewer() {
    if (!window.pannellum) return;
    if (this._pannellumViewer) return;

    this._currScene++;
    const sceneID = this._currScene.toString();
    const options = {
      'default': { firstScene: sceneID },
      scenes: {}
    };
    options.scenes[sceneID] = this._sceneOptions;

    this._pannellumViewer = window.pannellum.viewer('ideditor-viewer-streetside', options);
  }


  loadViewerAsync() {
    if (this._pannellumViewerPromise) return this._pannellumViewerPromise;

    // create ms-wrapper, a photo wrapper class
    const context = this.context;
    let wrap = context.container().select('.photoviewer').selectAll('.ms-wrapper')
      .data([0]);

    // inject ms-wrapper into the photoviewer div
    // (used by all to house each custom photo viewer)
    let wrapEnter = wrap.enter()
      .append('div')
      .attr('class', 'photo-wrapper ms-wrapper')
      .classed('hide', true);

    // inject div to support streetside viewer (pannellum) and attribution line
    wrapEnter
      .append('div')
      .attr('id', 'ideditor-viewer-streetside')
      .on('pointerdown.streetside', () => {
        d3_select(window)
          .on('pointermove.streetside', () => {
            this._dispatch.call('viewerChanged');
          }, true);
      })
      .on('pointerup.streetside pointercancel.streetside', () => {
        d3_select(window)
          .on('pointermove.streetside', null);

        // continue dispatching events for a few seconds, in case viewer has inertia.
        let t = d3_timer(elapsed => {
          this._dispatch.call('viewerChanged');
          if (elapsed > 2000) {
            t.stop();
          }
        });
      })
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
      .on('click.forward', () => this._step(1))
      .html('►');


    // create working canvas for stitching together images
    wrap = wrap
      .merge(wrapEnter)
      .call(this._setupCanvas);

    // Register viewer resize handler
    context.ui().photoviewer.on('resize.streetside', () => {
      if (this._pannellumViewer) this._pannellumViewer.resize();
    });

    this._pannellumViewerPromise = new Promise((resolve, reject) => {
      let loadedCount = 0;
      function loaded() {
        loadedCount += 1;
        // wait until both files are loaded
        if (loadedCount === 2) resolve();
      }

      const head = d3_select('head');

      // load streetside pannellum viewer css
      head.selectAll('#ideditor-streetside-viewercss')
        .data([0])
        .enter()
        .append('link')
        .attr('id', 'ideditor-streetside-viewercss')
        .attr('rel', 'stylesheet')
        .attr('crossorigin', 'anonymous')
        .attr('href', context.asset(pannellumViewerCSS))
        .on('load.serviceStreetside', loaded)
        .on('error.serviceStreetside', reject);

      // load streetside pannellum viewer js
      head.selectAll('#ideditor-streetside-viewerjs')
        .data([0])
        .enter()
        .append('script')
        .attr('id', 'ideditor-streetside-viewerjs')
        .attr('crossorigin', 'anonymous')
        .attr('src', context.asset(pannellumViewerJS))
        .on('load.serviceStreetside', loaded)
        .on('error.serviceStreetside', reject);
    })
    .catch(err => {
      if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
      this._pannellumViewerPromise = null;
    });

    return this._pannellumViewerPromise;
  }


  /**
   * _step
   * Step to the next bubble in the sequence
   * @param  stepBy  1 to step forward, -1 to step backward
   */
  _step(stepBy) {
    const context = this.context;
    const viewer = context.container().select('.photoviewer');
    const selected = viewer.empty() ? undefined : viewer.datum();
    if (!selected) return;

    let nextID = (stepBy === 1 ? selected.ne : selected.pr);
    const yaw = this._pannellumViewer.getYaw();
    this._sceneOptions.yaw = yaw;

    const ca = selected.ca + yaw;
    const origin = selected.loc;

    // construct a search trapezoid pointing out from current bubble
    const meters = 35;
    const p1 = [
      origin[0] + geoMetersToLon(meters / 5, origin[1]),
      origin[1]
    ];
    const p2 = [
      origin[0] + geoMetersToLon(meters / 2, origin[1]),
      origin[1] + geoMetersToLat(meters)
    ];
    const p3 = [
      origin[0] - geoMetersToLon(meters / 2, origin[1]),
      origin[1] + geoMetersToLat(meters)
    ];
    const p4 = [
      origin[0] - geoMetersToLon(meters / 5, origin[1]),
      origin[1]
    ];

    let poly = [p1, p2, p3, p4, p1];

    // rotate it to face forward/backward
    const angle = (stepBy === 1 ? ca : ca + 180) * (Math.PI / 180);
    poly = geomRotatePoints(poly, -angle, origin);

    let extent = poly.reduce((extent, point) => {
      // update extent in place
      extent.min = [ Math.min(extent.min[0], point[0]), Math.min(extent.min[1], point[1]) ];
      extent.max = [ Math.max(extent.max[0], point[0]), Math.max(extent.max[1], point[1]) ];
      return extent;
    }, new Extent());

    // find nearest other bubble in the search polygon
    let minDist = Infinity;
    this._cache.rtree.search(extent.bbox())
      .forEach(d => {
        if (d.data.id === selected.id) return;
        if (!geomPointInPolygon(d.data.loc, poly)) return;

        let dist = vecLength(d.data.loc, selected.loc);
        const theta = selected.ca - d.data.ca;
        const minTheta = Math.min(Math.abs(theta), 360 - Math.abs(theta));
        if (minTheta > 20) {
          dist += 5;  // penalize distance if camera angles don't match
        }

        if (dist < minDist) {
          nextID = d.data.id;
          minDist = dist;
        }
      });

    const nextBubble = nextID && this.cachedImage(nextID);
    if (!nextBubble) return;

    context.map().centerEase(nextBubble.loc);
    context.photos().selectPhoto('streetside', nextBubble.id);
  }


  /**
   * showViewer
   */
  showViewer() {
    let wrap = this.context.container().select('.photoviewer').classed('hide', false);
    const isHidden = wrap.selectAll('.photo-wrapper.ms-wrapper.hide').size();

    if (isHidden) {
      wrap
        .selectAll('.photo-wrapper:not(.ms-wrapper)')
        .classed('hide', true);

      wrap
        .selectAll('.photo-wrapper.ms-wrapper')
        .classed('hide', false);
    }

    return this;
  }


  /**
   * hideViewer
   */
  hideViewer() {
    const context = this.context;
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
  }


  /**
   * selectImage
   * note: call `context.photos().selectPhoto(layerID, photoID)` instead
   * That will deal with the URL and call this function
   */
  selectImage(context, bubbleID) {
    let d = this.cachedImage(bubbleID);

    let viewer = context.container().select('.photoviewer');
    if (!viewer.empty()) {
      viewer.datum(d);
    }

    this.setStyles(context, null, true);

    let wrap = context.container().select('.photoviewer .ms-wrapper');
    let attribution = wrap.selectAll('.photo-attribution').html('');

    wrap.selectAll('.pnlm-load-box')   // display "loading.."
      .style('display', 'block')
      .style('transform', 'translate(-50%, -50%)');

    if (!d) return this;

    this._sceneOptions.northOffset = d.ca;

    let line1 = attribution
      .append('div')
      .attr('class', 'attribution-row');

    const hiresDomID = utilUniqueString('streetside-hires');

    // Add hires checkbox
    let label = line1
      .append('label')
      .attr('for', hiresDomID)
      .attr('class', 'streetside-hires');

    label
      .append('input')
      .attr('type', 'checkbox')
      .attr('id', hiresDomID)
      .property('checked', this._hires)
      .on('click', d3_event => {
        d3_event.stopPropagation();

        this._hires = !this._hires;
        this._resolution = this._hires ? 1024 : 512;
        wrap.call(this._setupCanvas);

        const viewstate = {
          yaw: this._pannellumViewer.getYaw(),
          pitch: this._pannellumViewer.getPitch(),
          hfov: this._pannellumViewer.getHfov()
        };

        this._sceneOptions = Object.assign(this._sceneOptions, viewstate);
        context.photos().selectPhoto('streetside', d.id);
      });

    label
      .append('span')
      .html(t.html('streetside.hires'));


    let captureInfo = line1
      .append('div')
      .attr('class', 'attribution-capture-info');

    // Add capture date
    if (d.captured_by) {
      const yyyy = (new Date()).getFullYear();

      captureInfo
        .append('a')
        .attr('class', 'captured_by')
        .attr('target', '_blank')
        .attr('href', 'https://www.microsoft.com/en-us/maps/streetside')
        .text(`© ${yyyy} Microsoft`);

      captureInfo
        .append('span')
        .text('|');
    }

    if (d.captured_at) {
      captureInfo
        .append('span')
        .attr('class', 'captured_at')
        .text(this._localeTimestamp(d.captured_at));
    }

    // Add image links
    let line2 = attribution
      .append('div')
      .attr('class', 'attribution-row');

    line2
      .append('a')
      .attr('class', 'image-view-link')
      .attr('target', '_blank')
      .attr('href', 'https://www.bing.com/maps?cp=' + d.loc[1] + '~' + d.loc[0] +
        '&lvl=17&dir=' + d.ca + '&style=x&v=2&sV=1')
      .html(t.html('streetside.view_on_bing'));

    line2
      .append('a')
      .attr('class', 'image-report-link')
      .attr('target', '_blank')
      .attr('href', 'https://www.bing.com/maps/privacyreport/streetsideprivacyreport?bubbleid=' +
        encodeURIComponent(d.id) + '&focus=photo&lat=' + d.loc[1] + '&lng=' + d.loc[0] + '&z=17')
      .html(t.html('streetside.report'));


// const streetsideImagesApi = 'https://t.ssl.ak.tiles.virtualearth.net/tiles/';
const streetsideImagesApi = 'http://ecn.t0.tiles.virtualearth.net/tiles/';

    let bubbleIdQuadKey = d.id.toString(4);
    const paddingNeeded = 16 - bubbleIdQuadKey.length;
    for (let i = 0; i < paddingNeeded; i++) {
      bubbleIdQuadKey = '0' + bubbleIdQuadKey;
    }
    const imgUrlPrefix = streetsideImagesApi + 'hs' + bubbleIdQuadKey;
    // const imgUrlSuffix = '.jpg?g=6338&n=z';
    const imgUrlSuffix = '?g=13305&n=z';

    // Cubemap face code order matters here: front=01, right=02, back=03, left=10, up=11, down=12
    const faceKeys = ['01','02','03','10','11','12'];

    // Map images to cube faces
    const quadKeys = this._getQuadKeys();
    const faces = faceKeys.map(faceKey => {
      return quadKeys.map(quadKey => {
        const xy = this._qkToXY(quadKey);
        return {
          face: faceKey,
          url: imgUrlPrefix + faceKey + quadKey + imgUrlSuffix,
          x: xy[0],
          y: xy[1]
        };
      });
    });

    this._loadFacesAsync(faces)
      .then(() => {
        if (!this._pannellumViewer) {
          this.initViewer();
        } else {
          // make a new scene
          this._currScene++;
          let sceneID = this._currScene.toString();
          this._pannellumViewer
            .addScene(sceneID, this._sceneOptions)
            .loadScene(sceneID);

          // remove previous scene
          if (this._currScene > 2) {
            sceneID = (this._currScene - 1).toString();
            this._pannellumViewer
              .removeScene(sceneID);
          }
        }
      });

    return this;
  }


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

    let hoveredBubbleID = hovered?.id;
    let hoveredSequenceID = hovered?.sequenceID;
    let hoveredSequence = hoveredSequenceID && this._cache.sequences.get(hoveredSequenceID);
    let hoveredBubbleIDs =  (hoveredSequence && hoveredSequence.bubbles.map(d => d.id)) || [];

    let viewer = context.container().select('.photoviewer');
    let selected = viewer.empty() ? undefined : viewer.datum();
    let selectedBubbleID = selected?.id;
    let selectedSequenceID = selected?.sequenceID;
    let selectedSequence = selectedSequenceID && this._cache.sequences.get(selectedSequenceID);
    let selectedBubbleIDs = (selectedSequence && selectedSequence.bubbles.map(d => d.id)) || [];

    // highlight sibling viewfields on either the selected or the hovered sequences
    let highlightedBubbleIDs = utilArrayUnion(hoveredBubbleIDs, selectedBubbleIDs);

    context.container().selectAll('.layer-streetside-images .viewfield-group')
      .classed('highlighted', d => highlightedBubbleIDs.indexOf(d.id) !== -1)
      .classed('hovered',     d => d.id === hoveredBubbleID)
      .classed('currentView', d => d.id === selectedBubbleID);

    context.container().selectAll('.layer-streetside-images .sequence')
      .classed('highlighted', d => d.properties.id === hoveredSequenceID)
      .classed('currentView', d => d.properties.id === selectedSequenceID);

    // update viewfields if needed
    context.container().selectAll('.layer-streetside-images .viewfield-group .viewfield')
      .attr('d', viewfieldPath);

    function viewfieldPath() {
      let d = this.parentNode.__data__;
      if (d.isPano && d.id !== selectedBubbleID) {
        return 'M 8,13 m -10,0 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0';
      } else {
        return 'M 6,9 C 8,8.4 8,8.4 10,9 L 16,-2 C 12,-5 4,-5 0,-2 z';
      }
    }

    return this;
  }



  /**
   * _localeTimestamp
   */
  _localeTimestamp(s) {
    if (!s) return null;
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString(localizer.localeCode(), options);
  }


  /**
   * _loadTiles
   * wraps the process of generating tiles and then fetching image points for each tile.
   */
  _loadTiles(projection, margin) {
    // Determine the needed tiles to cover the view
    const needTiles = this._tiler.zoomRange(TILEZOOM).margin(margin).getTiles(projection).tiles;

    // Abort inflight requests that are no longer needed
    for (const [tileID, inflight] of this._cache.inflight.entries()) {
      const needed = needTiles.find(tile => tile.id === tileID);
      if (!needed) {
        inflight.controller.abort();
      }
    }

    // Fetch files that are needed
    for (const tile of needTiles) {
      const tileID = tile.id;
      if (this._cache.loaded.has(tileID) || this._cache.inflight.has(tileID)) continue;

      // Promise.all([this._fetchMetadataAsync(tile), this._fetchBubblesAsync(tile)])
      this._fetchBubblesAsync(tile)
        .then(results => this._processResults(results))
        .catch(err => {
          if (err.name === 'AbortError') return;          // ok
          if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
        });
    }
  }


  _processResults(results) {
    // const metadata = results[0];
    // this._cache.loaded.add(results[1].tile.id);
    // const bubbles = results[1].data;
    this._cache.loaded.add(results.tile.id);
    const bubbles = results.data;
    if (!bubbles) return;
    if (bubbles.error) throw new Error(bubbles.error);

    // [].shift() removes the first element, some statistics info, not a bubble point
    bubbles.shift();

    const boxes = bubbles.map(bubble => {
      if (this._cache.bubbles.has(bubble.id)) return null;  // skip duplicates

      const loc = [bubble.lo, bubble.la];
      const bubbleData = {
        loc: loc,
        id: bubble.id,
        ca: bubble.he,
        captured_at: bubble.cd,
        captured_by: 'microsoft',
        pr: bubble.pr,  // previous
        ne: bubble.ne,  // next
        isPano: true,
        sequenceID: null
      };

      this._cache.bubbles.set(bubble.id,  bubbleData);

      // a sequence starts here
      if (bubble.pr === undefined) {
        this._cache.leaders.push(bubble.id);
      }

      return {
        minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1], data: bubbleData
      };

    }).filter(Boolean);

    this._cache.rtree.load(boxes);

    this._connectSequences();
    this._dispatch.call('loadedImages');
  }


  // call this sometimes to connect the bubbles into sequences
  _connectSequences() {
    let keepLeaders = [];

    for (let i = 0; i < this._cache.leaders.length; i++) {
      let bubble = this._cache.bubbles.get(this._cache.leaders[i]);
      let seen = {};

      // Try to make a sequence.. use the id of the leader bubble.
      let sequence = { id: bubble.id, bubbles: [] };
      let complete = false;

      do {
        sequence.bubbles.push(bubble);
        seen[bubble.id] = true;

        if (bubble.ne === undefined) {  // no next
          complete = true;
        } else {
          bubble = this._cache.bubbles.get(bubble.ne);  // advance to next
        }
      } while (bubble && !seen[bubble.id] && !complete);

      if (complete) {
        // assign bubbles to the sequence
        for (let j = 0; j < sequence.bubbles.length; j++) {
          sequence.bubbles[j].sequenceID = sequence.id;
        }

        // create a GeoJSON LineString
        sequence.geojson = {
          type: 'LineString',
          properties: {
            id: sequence.id,
            captured_at: sequence.bubbles[0] ? sequence.bubbles[0].captured_at : null,
            captured_by: sequence.bubbles[0] ? sequence.bubbles[0].captured_by : null
          },
          coordinates: sequence.bubbles.map(d => d.loc)
        };

        this._cache.sequences.set(sequence.id, sequence);

      } else {
        keepLeaders.push(this._cache.leaders[i]);
      }
    }

    // couldn't complete these, save for later
    this._cache.leaders = keepLeaders;
  }


  /**
   * _fetchMetadataAsync
   * https://learn.microsoft.com/en-us/bingmaps/rest-services/imagery/get-imagery-metadata
   */
  _fetchMetadataAsync(tile) {  // eslint-disable-line  no-unused-vars
    // only fetch it once
    if (this._cache.metadataPromise) return this._cache.metadataPromise;

    const [lon, lat] = tile.wgs84Extent.center();
    const metadataURLBase = 'https://dev.virtualearth.net/REST/v1/Imagery/MetaData/Streetside';
    const metadataKey = 'AoG8TaQvkPo6o8SlpRVmBs7WJwO_NDQklVRcAfpn7P8oiEMYWNY59XHSJU81sP1Y';
    const metadataURL = `${metadataURLBase}/${lat},${lon}?key=${metadataKey}`;

    this._cache.metadataPromise = d3_json(metadataURL)
      .then(data => {
        if (!data) throw new Error('no data');
        return data;
      });
  }


  /**
   * _fetchBubblesAsync
   * bubbles:   undocumented / unsupported API?
   */
  _fetchBubblesAsync(tile) {
    const [w, s, e, n] = tile.wgs84Extent.rectangle();
    const MAXRESULTS = 2000;

    const bubbleURLBase = 'https://dev.virtualearth.net/mapcontrol/HumanScaleServices/GetBubbles.ashx?';
    const bubbleKey = 'AuftgJsO0Xs8Ts4M1xZUQJQXJNsvmh3IV8DkNieCiy3tCwCUMq76-WpkrBtNAuEm';
    const bubbleURL = bubbleURLBase + utilQsString({ n: n, s: s, e: e, w: w, c: MAXRESULTS, appkey: bubbleKey, jsCallback: '{callback}' });

    const inflight = this._cache.inflight.get(tile.id);
    if (inflight) return inflight.promise;

    // Wrap JSONP request in an abortable Promise
    const controller = new AbortController();
    const promise = new Promise((resolve, reject) => {
      let onAbort;
      const request = jsonpRequest(bubbleURL, data => {
        if (onAbort) controller.signal.removeEventListener('abort', onAbort);
        resolve({ data: data, tile: tile });
      });

      onAbort = () => {
        controller.signal.removeEventListener('abort', onAbort);
        request.abort();
        reject(new DOMException('Aborted', 'AbortError'));
      };
      controller.signal.addEventListener('abort', onAbort);
    })
    .finally(() => {
      this._cache.inflight.delete(tile.id);
    });

    this._cache.inflight.set(tile.id, { promise: promise, controller: controller });

    return promise;
  }


  /**
   * _loadImageAsync
   */
  _loadImageAsync(imgInfo) {
    return new Promise(resolve => {
      const face = imgInfo.face;
      const canvas = document.getElementById(`ideditor-canvas${face}`);
      const ctx = canvas.getContext('2d');

      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, imgInfo.x, imgInfo.y);
        resolve({ imgInfo: imgInfo, status: 'ok' });
      };
      img.onerror = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        resolve({ imgInfo: imgInfo, status: 'error' });
      };
      img.setAttribute('crossorigin', '');
      img.src = imgInfo.url;
    });
  }


  /**
   * _loadFaceAsync
   */
  _loadFaceAsync(imageGroup) {
    return Promise.all(imageGroup.map(d => this._loadImageAsync(d)))
      .then(data => {
        const face = data[0].imgInfo.face;
        const canvas = document.getElementById(`ideditor-canvas${face}`);
        const which = { '01': 0, '02': 1, '03': 2, '10': 3, '11': 4, '12': 5 };
        this._sceneOptions.cubeMap[which[face]] = canvas.toDataURL('image/jpeg', 1.0);
        return { status: `face ${face} ok` };
      });
  }


  /**
   * _loadFacesAsync
   */
  _loadFacesAsync(faceGroup) {
    return Promise.all(faceGroup.map(d => this._loadFaceAsync(d)))
      .then(() => { return { status: 'this._loadFacesAsync done' }; });
  }


  _setupCanvas(selection) {
    selection.selectAll('#ideditor-stitcher-canvases')
      .remove();

    // Add the Streetside working canvases. These are used for 'stitching', or combining,
    // multiple images for each of the six faces, before passing to the Pannellum control as DataUrls
    selection.selectAll('#ideditor-stitcher-canvases')
      .data([0])
      .enter()
      .append('div')
      .attr('id', 'ideditor-stitcher-canvases')
      .attr('display', 'none')
      .selectAll('canvas')
      .data(['canvas01', 'canvas02', 'canvas03', 'canvas10', 'canvas11', 'canvas12'])
      .enter()
      .append('canvas')
      .attr('id', d => `ideditor-${d}`)
      .attr('width', this._resolution)
      .attr('height', this._resolution);
  }


  _qkToXY(qk) {
    let x = 0;
    let y = 0;
    let scale = 256;
    for (let i = qk.length; i > 0; i--) {
      const key = qk[i-1];
      x += (+(key === '1' || key === '3')) * scale;
      y += (+(key === '2' || key === '3')) * scale;
      scale *= 2;
    }
    return [x, y];
  }


  _getQuadKeys() {
    const dim = this._resolution / 256;
    let quadKeys;

    if (dim === 16) {
      quadKeys = [
        '0000','0001','0010','0011','0100','0101','0110','0111',  '1000','1001','1010','1011','1100','1101','1110','1111',
        '0002','0003','0012','0013','0102','0103','0112','0113',  '1002','1003','1012','1013','1102','1103','1112','1113',
        '0020','0021','0030','0031','0120','0121','0130','0131',  '1020','1021','1030','1031','1120','1121','1130','1131',
        '0022','0023','0032','0033','0122','0123','0132','0133',  '1022','1023','1032','1033','1122','1123','1132','1133',
        '0200','0201','0210','0211','0300','0301','0310','0311',  '1200','1201','1210','1211','1300','1301','1310','1311',
        '0202','0203','0212','0213','0302','0303','0312','0313',  '1202','1203','1212','1213','1302','1303','1312','1313',
        '0220','0221','0230','0231','0320','0321','0330','0331',  '1220','1221','1230','1231','1320','1321','1330','1331',
        '0222','0223','0232','0233','0322','0323','0332','0333',  '1222','1223','1232','1233','1322','1323','1332','1333',

        '2000','2001','2010','2011','2100','2101','2110','2111',  '3000','3001','3010','3011','3100','3101','3110','3111',
        '2002','2003','2012','2013','2102','2103','2112','2113',  '3002','3003','3012','3013','3102','3103','3112','3113',
        '2020','2021','2030','2031','2120','2121','2130','2131',  '3020','3021','3030','3031','3120','3121','3130','3131',
        '2022','2023','2032','2033','2122','2123','2132','2133',  '3022','3023','3032','3033','3122','3123','3132','3133',
        '2200','2201','2210','2211','2300','2301','2310','2311',  '3200','3201','3210','3211','3300','3301','3310','3311',
        '2202','2203','2212','2213','2302','2303','2312','2313',  '3202','3203','3212','3213','3302','3303','3312','3313',
        '2220','2221','2230','2231','2320','2321','2330','2331',  '3220','3221','3230','3231','3320','3321','3330','3331',
        '2222','2223','2232','2233','2322','2323','2332','2333',  '3222','3223','3232','3233','3322','3323','3332','3333'
      ];

    } else if (dim === 8) {
      quadKeys = [
        '000','001','010','011',  '100','101','110','111',
        '002','003','012','013',  '102','103','112','113',
        '020','021','030','031',  '120','121','130','131',
        '022','023','032','033',  '122','123','132','133',

        '200','201','210','211',  '300','301','310','311',
        '202','203','212','213',  '302','303','312','313',
        '220','221','230','231',  '320','321','330','331',
        '222','223','232','233',  '322','323','332','333'
      ];

    } else if (dim === 4) {
      quadKeys = [
        '00','01',  '10','11',
        '02','03',  '12','13',

        '20','21',  '30','31',
        '22','23',  '32','33'
      ];

    } else {  // dim === 2
      quadKeys = [
        '0', '1',
        '2', '3'
      ];
    }

    return quadKeys;
  }

}
