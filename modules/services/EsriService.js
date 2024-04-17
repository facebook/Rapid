import { select as d3_select } from 'd3-selection';
import { Tiler } from '@rapid-sdk/math';
import { utilQsString } from '@rapid-sdk/util';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { Graph, Tree } from '../core/lib/index.js';
import { osmNode, osmRelation, osmWay } from '../osm/index.js';
import { utilFetchResponse } from '../util/index.js';


const GROUPID = 'bdf6c800b3ae453b9db239e03d7c1727';
const APIROOT = 'https://openstreetmap.maps.arcgis.com/sharing/rest/content';
const HOMEROOT = 'https://openstreetmap.maps.arcgis.com/home';
const TILEZOOM = 14;


/**
 * `EsriService`
 *
 * Events available:
 *   `loadedData`
 */
export class EsriService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'esri';
    this.context = context;

    this._tiler = new Tiler().zoomRange(TILEZOOM);
    this._datasets = {};
    this._gotDatasets = false;

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._parseDataset = this._parseDataset.bind(this);
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
    this._started = true;
    return Promise.resolve();
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    for (const ds of Object.values(this._datasets)) {
      if (ds.cache.inflight) {
        Object.values(ds.cache.inflight).forEach(controller => this._abortRequest(controller));
      }
      ds.graph = new Graph();
      ds.tree = new Tree(ds.graph);
      ds.cache = { inflight: {}, loaded: {}, seen: {} };
      ds.lastv = null;
    }

    return Promise.resolve();
  }


  /**
   * getData
   * Get already loaded data that appears in the current map view
   * @param   {string}  datasetID - datasetID to get data for
   * @return  {Array}   Array of data (OSM Entities)
   */
  getData(datasetID) {
    const ds = this._datasets[datasetID];
    if (!ds || !ds.tree || !ds.graph) return [];

    const extent = this.context.viewport.visibleExtent();
    return ds.tree.intersects(extent, ds.graph);
  }


  /**
   * loadTiles
   * Schedule any data requests needed to cover the current map view
   * @param   {string}  datasetID - datasetID to load tiles for
   */
  loadTiles(datasetID) {
    if (this._paused) return;

    // `loadDatasetsAsync` and `loadLayerAsync` are asynchronous,
    // so ensure both have completed before we start requesting tiles.
    const ds = this._datasets[datasetID];
    if (!ds || !ds.layer) return;

    const cache = ds.cache;
    const locations = this.context.systems.locations;

    const viewport = this.context.viewport;
    if (ds.lastv === viewport.v) return;  // exit early if the view is unchanged
    ds.lastv = viewport.v;

    // Determine the tiles needed to cover the view..
    const tiles = this._tiler.getTiles(viewport).tiles;

    // Abort inflight requests that are no longer needed..
    for (const k of Object.keys(cache.inflight)) {
      const wanted = tiles.find(tile => tile.id === k);
      if (!wanted) {
        this._abortRequest(cache.inflight[k]);
        delete cache.inflight[k];
      }
    }

    for (const tile of tiles) {
      if (cache.loaded[tile.id] || cache.inflight[tile.id]) continue;

      // exit if this tile covers a blocked region (all corners are blocked)
      const corners = tile.wgs84Extent.polygon().slice(0, 4);
      const tileBlocked = corners.every(loc => locations.blocksAt(loc).length);
      if (tileBlocked) {
        cache.loaded[tile.id] = true;  // don't try again
        continue;
      }

      this._loadTilePage(ds, tile, 0);
    }
  }


  graph(datasetID)  {
    const ds = this._datasets[datasetID];
    return ds?.graph;
  }


  loadDatasetsAsync() {
    if (this._gotDatasets) {
      return Promise.resolve(this._datasets);

    } else {
      const thiz = this;
      return new Promise((resolve, reject) => {
        let start = 1;
        fetchMore(start);

        function fetchMore(start) {
          fetch(thiz._searchURL(start))
            .then(utilFetchResponse)
            .then(json => {
              for (const ds of json.results ?? []) {
                thiz._parseDataset(ds);
              }

              if (json.nextStart > 0) {
                fetchMore(json.nextStart);  // fetch next page
              } else {
                thiz._gotDatasets = true;   // no more pages
                resolve(thiz._datasets);
              }
            })
            .catch(e => {
              thiz._gotDatasets = false;
              reject(e);
            });
        }
      });
    }
  }


  loadLayerAsync(datasetID) {
    let ds = this._datasets[datasetID];
    if (!ds || !ds.url) {
      return Promise.reject(`Unknown datasetID: ${datasetID}`);
    } else if (ds.layer) {
      return Promise.resolve(ds.layer);
    }

    return fetch(this._layerURL(ds.url))
      .then(utilFetchResponse)
      .then(json => {
        if (!json.layers || !json.layers.length) {
          throw new Error(`Missing layer info for datasetID: ${datasetID}`);
        }

        ds.layer = json.layers[0];  // should return a single layer

        // Use the field metadata to map to OSM tags
        let tagmap = {};
        for (const f of ds.layer.fields) {
          if (f.type === 'esriFieldTypeOID') {  // this is an id field, remember it
            ds.layer.idfield = f.name;
          }
          if (!f.editable) continue;   // 1. keep "editable" fields only
          tagmap[f.name] = f.alias;    // 2. field `name` -> OSM tag (stored in `alias`)
        }
        ds.layer.tagmap = tagmap;

        return ds.layer;
      })
      .catch(e => {
        if (e.name === 'AbortError') return;
        console.error(e);  // eslint-disable-line
      });
  }



  _abortRequest(controller) {
    controller.abort();
  }


  // API
  //https://developers.arcgis.com/rest/users-groups-and-items/search.htm
  _searchURL(start) {
    const params = {
      f: 'json',
      sortField: 'title',
      sortOrder: 'asc',
      num: 100,
      start: start
    };
    return `${APIROOT}/groups/${GROUPID}/search?` + utilQsString(params);
    // use to get
    // .results[]
    //   .extent
    //   .id
    //   .thumbnail
    //   .title
    //   .snippet
    //   .url (featureServer)
  }

  _layerURL(featureServerURL) {
    return `${featureServerURL}/layers?f=json`;
    // should return single layer(?)
    // .layers[0]
    //   .copyrightText
    //   .fields
    //   .geometryType   "esriGeometryPoint" or "esriGeometryPolygon" ?
  }

  _itemURL(itemID) {
    return `${HOMEROOT}/item.html?id=${itemID}`;
  }

  _tileURL(ds, extent, page) {
    page = page || 0;
    const layerID = ds.layer.id;
    const maxRecordCount = ds.layer.maxRecordCount || 2000;
    const resultOffset = maxRecordCount * page;
    const params = {
      f: 'geojson',
      outfields: '*',
      outSR: 4326,
      geometryType: 'esriGeometryEnvelope',
      geometry: extent.toParam(),
      resultOffset: resultOffset,
      resultRecordCount: maxRecordCount
    };
    return `${ds.url}/${layerID}/query?` + utilQsString(params);
  }


  // Add each dataset to this._datasets, create internal state
  _parseDataset(ds) {
    if (this._datasets[ds.id]) return;  // unless we've seen it already

    this._datasets[ds.id] = ds;
    ds.graph = new Graph();
    ds.tree = new Tree(ds.graph);
    ds.cache = { inflight: {}, loaded: {}, seen: {} };
    ds.lastv = null;

    // cleanup the `licenseInfo` field by removing styles  (not used currently)
    let license = d3_select(document.createElement('div'));
    license.html(ds.licenseInfo);       // set innerHtml
    license.selectAll('*')
      .attr('style', null)
      .attr('size', null);
    ds.license_html = license.html();   // get innerHtml

    // generate public link to this item
    ds.itemURL = this._itemURL(ds.id);
  }


  _loadTilePage(ds, tile, page) {
    const cache = ds.cache;
    if (cache.loaded[tile.id]) return;

    const controller = new AbortController();
    const url = this._tileURL(ds, tile.wgs84Extent, page);

    fetch(url, { signal: controller.signal })
      .then(utilFetchResponse)
      .then(geojson => {
        if (!geojson) throw new Error('no geojson');

        this._parseTile(ds, tile, geojson, (err, results) => {
          if (err) throw new Error(err);
          ds.graph.rebase(results, [ds.graph], true);
          ds.tree.rebase(results, true);
        });
        return geojson.properties?.exceededTransferLimit;
      })
      .then(hasMorePages => {
        if (hasMorePages) {
          this._loadTilePage(ds, tile, ++page);
        } else {
          cache.loaded[tile.id] = true;
          delete cache.inflight[tile.id];

          this.context.deferredRedraw();
          this.emit('loadedData');
        }
      })
      .catch(e => {
        if (e.name === 'AbortError') return;
        console.error(e);  // eslint-disable-line
      });

    cache.inflight[tile.id] = controller;
  }


  _parseTile(dataset, tile, geojson, callback) {
    if (!geojson) return callback({ message: 'No GeoJSON', status: -1 });

    // expect a FeatureCollection with `features` array
    let results = [];
    for (const f of geojson.features ?? []) {
      const entities = this._parseFeature(f, dataset);
      if (entities) results.push.apply(results, entities);
    }

    callback(null, results);
  }


  _parseFeature(feature, dataset) {
    const geom = feature.geometry;
    const props = feature.properties;
    if (!geom || !props) return null;

    const featureID = props[dataset.layer.idfield] || props.OBJECTID || props.FID || props.id;
    if (!featureID) return null;

    // skip if we've seen this feature already on another tile
    if (dataset.cache.seen[featureID]) return null;
    dataset.cache.seen[featureID] = true;

    const id = `${dataset.id}-${featureID}`;
    const metadata = { __fbid__: id, __service__: 'esri', __datasetid__: dataset.id };
    let entities = [];
    let nodemap = new Map();

    // Point:  make a single node
    if (geom.type === 'Point') {
      return [ new osmNode({ loc: geom.coordinates, tags: parseTags(props) }, metadata) ];

    // LineString:  make nodes, single way
    } else if (geom.type === 'LineString') {
      const nodelist = parseCoordinates(geom.coordinates);
      if (nodelist.length < 2) return null;

      const w = new osmWay({ nodes: nodelist, tags: parseTags(props) }, metadata);
      entities.push(w);
      return entities;

    // Polygon:  make nodes, way(s), possibly a relation
    } else if (geom.type === 'Polygon') {
      let ways = [];
      for (const ring of geom.coordinates ?? []) {
        const nodelist = parseCoordinates(ring);
        if (nodelist.length < 3) continue;

        const first = nodelist[0];
        const last = nodelist[nodelist.length - 1];
        if (first !== last) nodelist.push(first);   // sanity check, ensure rings are closed

        const w = new osmWay({ nodes: nodelist });
        ways.push(w);
      }

      if (ways.length === 1) {  // single ring, assign tags and return
        entities.push(
          ways[0].update( Object.assign({ tags: parseTags(props) }, metadata) )
        );
      } else {  // multiple rings, make a multipolygon relation with inner/outer members
        const members = ways.map((w, i) => {
          entities.push(w);
          return { id: w.id, role: (i === 0 ? 'outer' : 'inner'), type: 'way' };
        });
        const tags = Object.assign(parseTags(props), { type: 'multipolygon' });
        const r = new osmRelation({ members: members, tags: tags }, metadata);
        entities.push(r);
      }

      return entities;
    }
    // no Multitypes for now (maybe not needed)

    function parseCoordinates(coords) {
      let nodelist = [];
      for (const coord of coords) {
        const key = coord.toString();
        let n = nodemap.get(key);
        if (!n) {
          n = new osmNode({ loc: coord });
          entities.push(n);
          nodemap.set(key, n);
        }
        nodelist.push(n.id);
      }
      return nodelist;
    }

    function parseTags(props) {
      let tags = {};
      for (const prop of Object.keys(props)) {
        const k = clean(dataset.layer.tagmap[prop]);
        const v = clean(props[prop]);
        if (k && v) {
          tags[k] = v;
        }
      }

      // Since ESRI had to split the massive google open buildings dataset into multiple countries,
      // They asked us to aggregate them all under the same 'Google Open Buildings' dataset - #1300
      let name = `${dataset.name}`;
      if (name.startsWith('Google_Buildings_for')) {
        name = 'Google_Open_Buildings';
      }

      tags.source = `esri/${name}`;
      return tags;
    }

    function clean(val) {
      return val ? val.toString().trim() : null;
    }
  }


}
