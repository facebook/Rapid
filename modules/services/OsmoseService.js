import { Color } from 'pixi.js';
import { Extent, Tiler, vecAdd } from '@rapid-sdk/math';
import { utilQsString } from '@rapid-sdk/util';
import { marked } from 'marked';
import RBush from 'rbush';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { QAItem } from '../osm/qa_item.js';
import { utilFetchResponse } from '../util/index.js';


const TILEZOOM = 14;
const OSMOSE_API = 'https://osmose.openstreetmap.fr/api/0.3';


/**
 * `OsmoseService`

 * Events available:
 *   'loadedData'
 */
export class OsmoseService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'osmose';
    this.autoStart = false;

    // persistent data - loaded at init
    this._osmoseColors = new Map();    // Map (itemType -> hex color)
    this._osmoseStrings = new Map();   // Map (locale -> Object containing strings)
    this._osmoseData = { icons: {}, types: [] };

    this._cache = null;   // cache gets replaced on init/reset
    this._tiler = new Tiler().zoomRange(TILEZOOM).skipNullIsland(true);
    this._lastv = null;
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
    const assets = this.context.systems.assets;
    return assets.loadAssetAsync('qa_data')
      .then(d => {
        this._osmoseData.icons = d.osmose.icons;
        this._osmoseData.types = Object.keys(d.osmose.icons)
          .map(s => s.split('-')[0])
          .reduce((unique, item) => unique.indexOf(item) !== -1 ? unique : [...unique, item], []);
      })
      .then(() => this._loadStringsAsync())
      .then(() => this._started = true);
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    if (this._cache) {
      Object.values(this._cache.inflightTile).forEach(controller => this._abortRequest(controller));
    }
    this._cache = {
      issues: new Map(),    // Map (itemID -> QAItem)
      loadedTile: {},
      inflightTile: {},
      inflightPost: {},
      closed: {},
      rtree: new RBush()
    };

    this._lastv = null;

    return Promise.resolve();
  }


  /**
   * getData
   * Get already loaded data that appears in the current map view
   * @return  {Array}  Array of data
   */
  getData() {
    const extent = this.context.viewport.visibleExtent();
    return this._cache.rtree.search(extent.bbox()).map(d => d.data);
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
    const tiles = this._tiler.getTiles(viewport).tiles;

    // Abort inflight requests that are no longer needed..
    this._abortUnwantedRequests(this._cache, tiles);

    // Issue new requests..
    for (const tile of tiles) {
      if (this._cache.loadedTile[tile.id] || this._cache.inflightTile[tile.id]) continue;

      const [x, y, z] = tile.xyz;
      const params = { item: this._osmoseData.types };   // Only request the types that we support
      const url = `${OSMOSE_API}/issues/${z}/${x}/${y}.json?` + utilQsString(params);

      const controller = new AbortController();
      this._cache.inflightTile[tile.id] = controller;

      fetch(url, { signal: controller.signal })
        .then(utilFetchResponse)
        .then(data => {
          this._cache.loadedTile[tile.id] = true;

          for (const issue of (data.features ?? [])) {
            // Osmose issues are uniquely identified by a unique
            // `item` and `class` combination (both integer values)
            const { item, class: cl, uuid: id } = issue.properties;
            const itemType = `${item}-${cl}`;

            // Filter out unsupported issue types (some are too specific or advanced)
            if (itemType in this._osmoseData.icons) {
              const loc = this._preventCoincident(issue.geometry.coordinates);
              const d = new QAItem(this, itemType, id, { loc: loc, item: item });

              // Assigning `elems` here prevents UI detail requests
              if (item === 8300 || item === 8360) {
                d.elems = [];
              }

              this._cache.issues.set(d.id, d);
              this._cache.rtree.insert(this._encodeIssueRtree(d));
            }
          }

          this.context.deferredRedraw();
          this.emit('loadedData');
        })
        .catch(err => {
          if (err.name === 'AbortError') return;    // ok
          this._cache.loadedTile[tile.id] = true;   // don't retry
        })
        .finally(() => {
          delete this._cache.inflightTile[tile.id];
        });
    }
  }


  /**
   * loadIssueDetailAsync
   * @param   issue
   * @return  Promise
   */
  loadIssueDetailAsync(issue) {
    // Issue details only need to be fetched once
    if (issue.elems !== undefined) return Promise.resolve(issue);

    const localeCode = this.context.systems.l10n.localeCode();
    const url = `${OSMOSE_API}/issue/${issue.id}?langs=${localeCode}`;
    const handleResponse = (data) => {
      // Associated elements used for highlighting
      // Assign directly for immediate use in the callback
      issue.elems = data.elems.map(e => e.type.substring(0,1) + e.id);
      // Some issues have instance specific detail in a subtitle
      issue.detail = data.subtitle ? marked.parse(data.subtitle.auto) : '';
      this.replaceItem(issue);
    };

    return fetch(url)
      .then(utilFetchResponse)
      .then(handleResponse)
      .then(() => issue);
  }


  /**
   * getStrings
   * @param   itemType
   * @param   locale
   * @return  stringdata
   */
  getStrings(itemType, locale) {
    locale = locale || this.context.systems.l10n.localeCode();

    const stringData = this._osmoseStrings.get(locale) ?? {};
    return stringData[itemType] ?? {};
  }


  /**
   * getColor
   * Get the color associated with this issue type
   * @param   itemInt
   * @return  hex color
   */
  getColor(itemInt) {
    return this._osmoseColors.get(itemInt) ?? 0xffffff;
  }


  /**
   * getIcon
   * Get the icon to use for the given itemType
   * @param   itemType
   * @return  icon name
   */
  getIcon(itemType) {
    return this._osmoseData.icons[itemType];
  }


  /**
   * postUpdate
   * @param   issue
   * @param   callback
   */
  postUpdate(issue, callback) {
    if (this._cache.inflightPost[issue.id]) {
      return callback({ message: 'Issue update already inflight', status: -2 }, issue);
    }

    // UI sets the status to either 'done' or 'false'
    const url = `${OSMOSE_API}/issue/${issue.id}/${issue.newStatus}`;
    const controller = new AbortController();
    const after = () => {
      delete this._cache.inflightPost[issue.id];

      this.removeItem(issue);
      if (issue.newStatus === 'done') {
        // Keep track of the number of issues closed per `item` to tag the changeset
        if (!(issue.item in this._cache.closed)) {
          this._cache.closed[issue.item] = 0;
        }
        this._cache.closed[issue.item] += 1;
      }
      if (callback) callback(null, issue);
    };

    this._cache.inflightPost[issue.id] = controller;

    fetch(url, { signal: controller.signal })
      .then(after)
      .catch(err => {
        delete this._cache.inflightPost[issue.id];
        if (callback) callback(err.message);
      });
  }


  /**
   * getError
   * Get a QAItem from cache
   * @param   issueID
   * @return  QAItem
   */
  getError(issueID) {
    return this._cache.issues.get(issueID);
  }


  /**
   * replaceItem
   * Replace a single QAItem in the cache
   * @param   item
   * @return  the item, or `null` if it couldn't be replaced
   */
  replaceItem(item) {
    if (!(item instanceof QAItem) || !item.id) return;

    this._cache.issues.set(item.id, item);
    this._updateRtree(this._encodeIssueRtree(item), true); // true = replace
    return item;
  }


  /**
   * removeItem
   * Remove a single QAItem from the cache
   * @param   item to remove
   */
  removeItem(item) {
    if (!(item instanceof QAItem) || !item.id) return;

    this._cache.isseus.delete(item.id);
    this._updateRtree(this._encodeIssueRtree(item), false); // false = remove
  }


  /**
   * getClosedCounts
   * Used to populate `closed:osmose:*` changeset tags
   * @return   the closed cache
   */
  getClosedCounts() {
    return this._cache.closed;
  }


  /**
   * itemURL
   * Returns the url to link to details about an item
   * @param   item
   * @return  the url
   */
  itemURL(item) {
    return `https://osmose.openstreetmap.fr/en/error/${item.id}`;
  }


  _abortRequest(controller) {
    if (controller) {
      controller.abort();
    }
  }

  _abortUnwantedRequests(cache, tiles) {
    Object.keys(cache.inflightTile).forEach(k => {
      const wanted = tiles.find(tile => k === tile.id);
      if (!wanted) {
        this._abortRequest(cache.inflightTile[k]);
        delete cache.inflightTile[k];
      }
    });
  }

  _encodeIssueRtree(d) {
    return { minX: d.loc[0], minY: d.loc[1], maxX: d.loc[0], maxY: d.loc[1], data: d };
  }

  // Replace or remove QAItem from rtree
  _updateRtree(item, replace) {
    this._cache.rtree.remove(item, (a, b) => a.data.id === b.data.id);
    if (replace) {
      this._cache.rtree.insert(item);
    }
  }

  // Issues shouldn't obscure each other
  _preventCoincident(loc) {
    let coincident = false;
    do {
      // first time, move marker up. after that, move marker right.
      let delta = coincident ? [0.00001, 0] : [0, 0.00001];
      loc = vecAdd(loc, delta);
      const bbox = new Extent(loc).bbox();
      coincident = this._cache.rtree.search(bbox).length;
    } while (coincident);

    return loc;
  }


  /**
   * _loadStringsAsync
   * Load the strings for the types of issues that we support
   * @return  Promise
   */
  _loadStringsAsync() {
    // Only need to cache strings for supported issue types
    const itemTypes = Object.keys(this._osmoseData.icons);

    // For now, we only do this one time at init.
    // Todo: support switching locales
    let stringData = {};
    const localeCode = this.context.systems.l10n.localeCode();
    this._osmoseStrings.set(localeCode, stringData);

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

        // Save item colors to automatically style issue markers later
        const itemInt = item.item;
        this._osmoseColors.set(itemInt, new Color(item.color).toNumber());

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
      const url = `${OSMOSE_API}/items/${item}/class/${cl}?langs=${localeCode}`;

      return fetch(url)
        .then(utilFetchResponse)
        .then(handleResponse);

    }).filter(Boolean);

    return Promise.all(allRequests);
  }
}
