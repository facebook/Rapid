import * as PIXI from 'pixi.js';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { json as d3_json } from 'd3-fetch';
import { Extent, Tiler, vecAdd } from '@rapid-sdk/math';
import { utilQsString } from '@rapid-sdk/util';
import { marked } from 'marked';
import RBush from 'rbush';

import { fileFetcher } from '../core/file_fetcher';
import { localizer } from '../core/localizer';
import { QAItem } from '../osm';
import { utilRebind } from '../util';


const TILEZOOM = 14;
const tiler = new Tiler().zoomRange(TILEZOOM);
const dispatch = d3_dispatch('loaded');
const _osmoseUrlRoot = 'https://osmose.openstreetmap.fr/api/0.3';

// persistent data - loaded at init
const _osmoseColors = new Map();    // Map (itemType -> hex color)
const _osmoseStrings = new Map();   // Map (locale -> Object containing strings)
const _osmoseData = { icons: {}, types: [] };

// cache gets cleared on reset
let _osmoseCache;


function abortRequest(controller) {
  if (controller) {
    controller.abort();
  }
}

function abortUnwantedRequests(cache, tiles) {
  Object.keys(cache.inflightTile).forEach(k => {
    let wanted = tiles.find(tile => k === tile.id);
    if (!wanted) {
      abortRequest(cache.inflightTile[k]);
      delete cache.inflightTile[k];
    }
  });
}

function encodeIssueRtree(d) {
  return { minX: d.loc[0], minY: d.loc[1], maxX: d.loc[0], maxY: d.loc[1], data: d };
}

// Replace or remove QAItem from rtree
function updateRtree(item, replace) {
  _osmoseCache.rtree.remove(item, (a, b) => a.data.id === b.data.id);
  if (replace) {
    _osmoseCache.rtree.insert(item);
  }
}


// Issues shouldn't obscure each other
function preventCoincident(loc) {
  let coincident = false;
  do {
    // first time, move marker up. after that, move marker right.
    let delta = coincident ? [0.00001, 0] : [0, 0.00001];
    loc = vecAdd(loc, delta);
    let bbox = new Extent(loc).bbox();
    coincident = _osmoseCache.rtree.search(bbox).length;
  } while (coincident);

  return loc;
}


export default {
  title: 'osmose',

  init() {
    this.reset();
    this.event = utilRebind(this, dispatch, 'on');

    fileFetcher.get('qa_data')
      .then(d => {
        _osmoseData.icons = d.osmose.icons;
        _osmoseData.types = Object.keys(d.osmose.icons)
          .map(s => s.split('-')[0])
          .reduce((unique, item) => unique.indexOf(item) !== -1 ? unique : [...unique, item], []);
      })
      .then(this.loadStringsAsync);
  },


  reset() {
    if (_osmoseCache) {
      Object.values(_osmoseCache.inflightTile).forEach(abortRequest);
    }
    _osmoseCache = {
      issues: new Map(),    // Map (itemID -> QAItem)
      loadedTile: {},
      inflightTile: {},
      inflightPost: {},
      closed: {},
      rtree: new RBush()
    };
  },


  loadIssues(projection) {
    // determine the needed tiles to cover the view
    const tiles = tiler.getTiles(projection).tiles;

    // abort inflight requests that are no longer needed
    abortUnwantedRequests(_osmoseCache, tiles);

    // issue new requests..
    tiles.forEach(tile => {
      if (_osmoseCache.loadedTile[tile.id] || _osmoseCache.inflightTile[tile.id]) return;

      const [x, y, z] = tile.xyz;
      const params = { item: _osmoseData.types };   // Only request the types that we support
      const url = `${_osmoseUrlRoot}/issues/${z}/${x}/${y}.json?` + utilQsString(params);

      const controller = new AbortController();
      _osmoseCache.inflightTile[tile.id] = controller;

      d3_json(url, { signal: controller.signal })
        .then(data => {
          delete _osmoseCache.inflightTile[tile.id];
          _osmoseCache.loadedTile[tile.id] = true;

          if (data.features) {
            data.features.forEach(issue => {
              // Osmose issues are uniquely identified by a unique
              // `item` and `class` combination (both integer values)
              const { item, class: cl, uuid: id } = issue.properties;
              const itemType = `${item}-${cl}`;

              // TODO: Delete before pushing to main.
              // if (issue.properties.item === 8410) {
              //   console.log('we got a live one');
              // }
              // Filter out unsupported issue types (some are too specific or advanced)
              if (itemType in _osmoseData.icons) {
                let loc = issue.geometry.coordinates; // lon, lat
                loc = preventCoincident(loc);

                let d = new QAItem(loc, this, itemType, id, { item });

                // Assigning `elems` here prevents UI detail requests
                if (item === 8300 || item === 8360) {
                  d.elems = [];
                }

                _osmoseCache.issues.set(d.id, d);
                _osmoseCache.rtree.insert(encodeIssueRtree(d));
              }
            });
          }

          dispatch.call('loaded');
        })
        .catch(() => {
          delete _osmoseCache.inflightTile[tile.id];
          _osmoseCache.loadedTile[tile.id] = true;
        });
    });
  },


  loadIssueDetailAsync(issue) {
    // Issue details only need to be fetched once
    if (issue.elems !== undefined) return Promise.resolve(issue);

    const url = `${_osmoseUrlRoot}/issue/${issue.id}?langs=${localizer.localeCode()}`;
    const handleResponse = (data) => {
      // Associated elements used for highlighting
      // Assign directly for immediate use in the callback
      issue.elems = data.elems.map(e => e.type.substring(0,1) + e.id);
      // Some issues have instance specific detail in a subtitle
      issue.detail = data.subtitle ? marked.parse(data.subtitle.auto) : '';
      this.replaceItem(issue);
    };

    return d3_json(url)
      .then(handleResponse)
      .then(() => issue);
  },


  // Load the strings for the types of issues that we support
  loadStringsAsync() {
    // Only need to cache strings for supported issue types
    const itemTypes = Object.keys(_osmoseData.icons);

    // For now, we only do this one time at init.
    // Todo: support switching locales
    let stringData = {};
    const locale = localizer.localeCode();
    _osmoseStrings.set(locale, stringData);

    // Using multiple individual item + class requests to reduce fetched data size
    const allRequests = itemTypes.map(itemType => {

      const handleResponse = (data) => {
        // Bunch of nested single value arrays of objects
        const [ cat = { items:[] } ] = data.categories;
        const [ item = { class:[] } ] = cat.items;
        const [ cl = null ] = item.class;

        // If null default value is reached, data wasn't as expected (or was empty)
        if (!cl) {
          /* eslint-disable no-console */
          console.log(`Osmose strings request (${itemType}) had unexpected data`);
          /* eslint-enable no-console */
          return;
        }

        // Cache served item colors to automatically style issue markers later
        const { item: itemInt, color } = item;
        if (/^#[A-Fa-f0-9]{6}|[A-Fa-f0-9]{3}/.test(color)) {
          _osmoseColors.set(itemInt, PIXI.utils.string2hex(color));
        }

        // Value of root key will be null if no string exists
        // If string exists, value is an object with key 'auto' for string
        const { title, detail, fix, trap } = cl;

        let issueStrings = {};
        // Force title to begin with an uppercase letter
        if (title)  issueStrings.title = title.auto.charAt(0).toUpperCase() + title.auto.slice(1);
        if (detail) issueStrings.detail = marked.parse(detail.auto);
        if (trap)   issueStrings.trap = marked.parse(trap.auto);
        if (fix)    issueStrings.fix = marked.parse(fix.auto);

        stringData[itemType] = issueStrings;
      };

      // Osmose API falls back to English strings where untranslated or if locale doesn't exist
      const [item, cl] = itemType.split('-');
      const url = `${_osmoseUrlRoot}/items/${item}/class/${cl}?langs=${locale}`;

      return d3_json(url).then(handleResponse);
    }).filter(Boolean);

    return Promise.all(allRequests);
  },


  getStrings(itemType, locale = localizer.localeCode()) {
    const stringData = _osmoseStrings.get(locale) ?? {};
    return stringData[itemType] ?? {};
  },


  getColor(itemInt) {
    return _osmoseColors.get(itemInt) ?? 0xffffff;
  },


  postUpdate(issue, callback) {
    if (_osmoseCache.inflightPost[issue.id]) {
      return callback({ message: 'Issue update already inflight', status: -2 }, issue);
    }

    // UI sets the status to either 'done' or 'false'
    const url = `${_osmoseUrlRoot}/issue/${issue.id}/${issue.newStatus}`;
    const controller = new AbortController();
    const after = () => {
      delete _osmoseCache.inflightPost[issue.id];

      this.removeItem(issue);
      if (issue.newStatus === 'done') {
        // Keep track of the number of issues closed per `item` to tag the changeset
        if (!(issue.item in _osmoseCache.closed)) {
          _osmoseCache.closed[issue.item] = 0;
        }
        _osmoseCache.closed[issue.item] += 1;
      }
      if (callback) callback(null, issue);
    };

    _osmoseCache.inflightPost[issue.id] = controller;

    fetch(url, { signal: controller.signal })
      .then(after)
      .catch(err => {
        delete _osmoseCache.inflightPost[issue.id];
        if (callback) callback(err.message);
      });
  },


  // Get all cached QAItems covering the viewport
  getItems(projection) {
    const viewport = projection.dimensions();
    const min = [viewport[0][0], viewport[1][1]];
    const max = [viewport[1][0], viewport[0][1]];
    const bbox = new Extent(projection.invert(min), projection.invert(max)).bbox();

    return _osmoseCache.rtree.search(bbox).map(d => d.data);
  },


  // Get a QAItem from cache
  getError(issueID) {
    return _osmoseCache.issues.get(issueID);
  },


  // get the name of the icon to display for this item
  getIcon(itemType) {
    return _osmoseData.icons[itemType];
  },


  // Replace a single QAItem in the cache
  replaceItem(item) {
    if (!(item instanceof QAItem) || !item.id) return;

    _osmoseCache.issues.set(item.id, item);
    updateRtree(encodeIssueRtree(item), true); // true = replace
    return item;
  },


  // Remove a single QAItem from the cache
  removeItem(item) {
    if (!(item instanceof QAItem) || !item.id) return;

    _osmoseCache.isseus.delete(item.id);
    updateRtree(encodeIssueRtree(item), false); // false = remove
  },


  // Used to populate `closed:osmose:*` changeset tags
  getClosedCounts() {
    return _osmoseCache.closed;
  },


  itemURL(item) {
    return `https://osmose.openstreetmap.fr/en/error/${item.id}`;
  }
};
