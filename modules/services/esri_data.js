import { dispatch as d3_dispatch } from 'd3-dispatch';
import { json as d3_json } from 'd3-fetch';
import { select as d3_select } from 'd3-selection';
import { Tiler } from '@id-sdk/math';
import { utilQsString } from '@id-sdk/util';

import { locationManager } from '../core/LocationManager';
import { Graph, Tree } from '../core';
import { osmNode, osmRelation, osmWay } from '../osm';
import { utilRebind } from '../util';


const GROUPID = 'bdf6c800b3ae453b9db239e03d7c1727';
const APIROOT = 'https://openstreetmap.maps.arcgis.com/sharing/rest/content';
const HOMEROOT = 'https://openstreetmap.maps.arcgis.com/home';
const TILEZOOM = 14;
const tiler = new Tiler().zoomRange(TILEZOOM);
const dispatch = d3_dispatch('loadedData');

let _datasets = {};
let _gotDatasets = false;
let _off;


function abortRequest(controller) {
  controller.abort();
}


// API
//https://developers.arcgis.com/rest/users-groups-and-items/search.htm
function searchURL(start) {
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

function layerURL(featureServerURL) {
  return `${featureServerURL}/layers?f=json`;
  // should return single layer(?)
  // .layers[0]
  //   .copyrightText
  //   .fields
  //   .geometryType   "esriGeometryPoint" or "esriGeometryPolygon" ?
}

function itemURL(itemID) {
  return `${HOMEROOT}/item.html?id=${itemID}`;
}

function tileURL(ds, extent, page) {
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


// Add each dataset to _datasets, create internal state
function parseDataset(ds) {
  if (_datasets[ds.id]) return;  // unless we've seen it already

  _datasets[ds.id] = ds;
  ds.graph = new Graph();
  ds.tree = new Tree(ds.graph);
  ds.cache = { inflight: {}, loaded: {}, seen: {}, origIdTile: {} };

  // cleanup the `licenseInfo` field by removing styles  (not used currently)
  let license = d3_select(document.createElement('div'));
  license.html(ds.licenseInfo);       // set innerHtml
  license.selectAll('*')
    .attr('style', null)
    .attr('size', null);
  ds.license_html = license.html();   // get innerHtml

  // generate public link to this item
  ds.itemURL = itemURL(ds.id);
}


function loadTilePage(ds, tile, page) {
  const cache = ds.cache;
  if (cache.loaded[tile.id]) return;

  const controller = new AbortController();
  const url = tileURL(ds, tile.wgs84Extent, page);

  d3_json(url, { signal: controller.signal })
    .then(geojson => {
      if (!geojson) throw new Error('no geojson');

      parseTile(ds, tile, geojson, (err, results) => {
        if (err) throw new Error(err);
        ds.graph.rebase(results, [ds.graph], true);
        ds.tree.rebase(results, true);
      });
      return (geojson.properties && geojson.properties.exceededTransferLimit);
    })
    .then(morePages => {
      if (morePages) {
        loadTilePage(ds, tile, ++page);
      } else {
        cache.loaded[tile.id] = true;
        dispatch.call('loadedData');
        delete cache.inflight[tile.id];
      }
    })
    .catch(e => {
      if (e.name === 'AbortError') return;
      console.error(e);  // eslint-disable-line
    });

  cache.inflight[tile.id] = controller;
}


function parseTile(dataset, tile, geojson, callback) {
  if (!geojson) return callback({ message: 'No GeoJSON', status: -1 });

  // expect a FeatureCollection with `features` array
  let results = [];
  (geojson.features || []).forEach(f => {
    let entities = parseFeature(f, dataset);
    if (entities) results.push.apply(results, entities);
  });

  callback(null, results);
}


function parseFeature(feature, dataset) {
  const geom = feature.geometry;
  const props = feature.properties;
  if (!geom || !props) return null;

  const featureID = props[dataset.layer.idfield] || props.OBJECTID || props.FID || props.id;
  if (!featureID) return null;

  // skip if we've seen this feature already on another tile
  if (dataset.cache.seen[featureID]) return null;
  dataset.cache.seen[featureID] = true;

  const id = `${dataset.id}-${featureID}`;
  const meta = { __fbid__: id, __origid__: id, __service__: 'esri', __datasetid__: dataset.id };
  let entities = [];
  let nodemap = new Map();

  // Point:  make a single node
  if (geom.type === 'Point') {
    return [ new osmNode({ loc: geom.coordinates, tags: parseTags(props) }, meta) ];

  // LineString:  make nodes, single way
  } else if (geom.type === 'LineString') {
    const nodelist = parseCoordinates(geom.coordinates);
    if (nodelist.length < 2) return null;

    const w = new osmWay({ nodes: nodelist, tags: parseTags(props) }, meta);
    entities.push(w);
    return entities;

  // Polygon:  make nodes, way(s), possibly a relation
  } else if (geom.type === 'Polygon') {
    let ways = [];
    geom.coordinates.forEach(ring => {
      const nodelist = parseCoordinates(ring);
      if (nodelist.length < 3) return null;

      const first = nodelist[0];
      const last = nodelist[nodelist.length - 1];
      if (first !== last) nodelist.push(first);   // sanity check, ensure rings are closed

      const w = new osmWay({ nodes: nodelist });
      ways.push(w);
    });

    if (ways.length === 1) {  // single ring, assign tags and return
      entities.push(
        ways[0].update( Object.assign({ tags: parseTags(props) }, meta) )
      );
    } else {  // multiple rings, make a multipolygon relation with inner/outer members
      const members = ways.map((w, i) => {
        entities.push(w);
        return { id: w.id, role: (i === 0 ? 'outer' : 'inner'), type: 'way' };
      });
      const tags = Object.assign(parseTags(props), { type: 'multipolygon' });
      const r = new osmRelation({ members: members, tags: tags }, meta);
      entities.push(r);
    }

    return entities;
  }
  // no Multitypes for now (maybe not needed)

  function parseCoordinates(coords) {
    let nodelist = [];
    coords.forEach(coord => {
      const key = coord.toString();
      let n = nodemap.get(key);
      if (!n) {
        n = new osmNode({ loc: coord });
        entities.push(n);
        nodemap.set(key, n);
      }
      nodelist.push(n.id);
    });
    return nodelist;
  }

  function parseTags(props) {
    let tags = {};
    Object.keys(props).forEach(prop => {
      const k = clean(dataset.layer.tagmap[prop]);
      const v = clean(props[prop]);
      if (k && v) {
        tags[k] = v;
      }
    });

    tags.source = `esri/${dataset.name}`;
    return tags;
  }

  function clean(val) {
    return val ? val.toString().trim() : null;
  }
}


export default {

  init: function () {
    this.event = utilRebind(this, dispatch, 'on');
  },


  reset: function () {
    Object.values(_datasets).forEach(ds => {
      if (ds.cache.inflight) {
        Object.values(ds.cache.inflight).forEach(abortRequest);
      }
      ds.graph = new Graph();
      ds.tree = new Tree(ds.graph);
      ds.cache = { inflight: {}, loaded: {}, seen: {}, origIdTile: {} };
    });

    return this;
  },


  graph: function (datasetID)  {
    const ds = _datasets[datasetID];
    return ds && ds.graph;
  },


  intersects: function (datasetID, extent) {
    const ds = _datasets[datasetID];
    if (!ds || !ds.tree || !ds.graph) return [];
    return ds.tree.intersects(extent, ds.graph);
  },


  toggle: function (val) {
    _off = !val;
    return this;
  },


  loadTiles: function (datasetID, projection) {
    if (_off) return;

    // `loadDatasets` and `loadLayer` are asynchronous,
    // so ensure both have completed before we start requesting tiles.
    const ds = _datasets[datasetID];
    if (!ds || !ds.layer) return;

    const cache = ds.cache;
    const tiles = tiler.getTiles(projection).tiles;

    // abort inflight requests that are no longer needed
    Object.keys(cache.inflight).forEach(k => {
      const wanted = tiles.find(tile => tile.id === k);
      if (!wanted) {
        abortRequest(cache.inflight[k]);
        delete cache.inflight[k];
      }
    });

    tiles.forEach(tile => {
      if (cache.loaded[tile.id] || cache.inflight[tile.id]) return;

      // exit if this tile covers a blocked region (all corners are blocked)
      const corners = tile.wgs84Extent.polygon().slice(0, 4);
      const tileBlocked = corners.every(loc => locationManager.blocksAt(loc).length);
      if (tileBlocked) {
        cache.loaded[tile.id] = true;  // don't try again
        return;
      }

      loadTilePage(ds, tile, 0);
    });
  },


  loadDatasets: function () {
    if (_gotDatasets) {
      return Promise.resolve(_datasets);

    } else {
      return new Promise((resolve, reject) => {
        let start = 1;
        fetchMore(start);

        function fetchMore(start) {
          d3_json(searchURL(start))
            .then(json => {
              (json.results || []).forEach(ds => parseDataset(ds));

              if (json.nextStart > 0) {
                fetchMore(json.nextStart);   // fetch next page
              } else {
                _gotDatasets = true;   // no more pages
                resolve(_datasets);
              }
            })
            .catch(e => {
              _gotDatasets = false;
              reject(e);
            });
        }
      });
    }
  },


  loadLayer: function (datasetID) {
    let ds = _datasets[datasetID];
    if (!ds || !ds.url) {
      return Promise.reject(`Unknown datasetID: ${datasetID}`);
    } else if (ds.layer) {
      return Promise.resolve(ds.layer);
    }

    return d3_json(layerURL(ds.url))
      .then(json => {
        if (!json.layers || !json.layers.length) {
          throw new Error(`Missing layer info for datasetID: ${datasetID}`);
        }

        ds.layer = json.layers[0];  // should return a single layer

        // Use the field metadata to map to OSM tags
        let tagmap = {};
        ds.layer.fields.forEach(f => {
          if (f.type === 'esriFieldTypeOID') {  // this is an id field, remember it
            ds.layer.idfield = f.name;
          }
          if (!f.editable) return;   // 1. keep "editable" fields only
          tagmap[f.name] = f.alias;  // 2. field `name` -> OSM tag (stored in `alias`)
        });
        ds.layer.tagmap = tagmap;

        return ds.layer;
      })
      .catch(e => {
        if (e.name === 'AbortError') return;
        console.error(e);  // eslint-disable-line
      });
  }
};
