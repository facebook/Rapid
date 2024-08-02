import { Extent, Tiler, vecAdd} from '@rapid-sdk/math';
import { utilQsString } from '@rapid-sdk/util';
import RBush from 'rbush';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { QAItem } from '../osm/qa_item.js';
import { utilFetchResponse } from '../util/index.js';


const KEEPRIGHT_API = 'https://www.keepright.at';
const TILEZOOM = 14;

const KR_RULES = [
  // no 20 - multiple node on same spot - these are mostly boundaries overlapping roads
  30, 40, 50, 60, 70, 90, 100, 110, 120, 130, 150, 160, 170, 180,
  190, 191, 192, 193, 194, 195, 196, 197, 198,
  200, 201, 202, 203, 204, 205, 206, 207, 208, 210, 220,
  230, 231, 232, 270, 280, 281, 282, 283, 284, 285,
  290, 291, 292, 293, 294, 295, 296, 297, 298, 300, 310, 311, 312, 313,
  320, 350, 360, 370, 380, 390, 400, 401, 402, 410, 411, 412, 413
];

// A mapping of KeepRight rule numbers to their respective colors.
const KR_COLORS = new Map();
['20', '40', '210', '270', '310', '320', '350'].forEach(key => KR_COLORS.set(key, 0xffff99));
['60', '70', '90', '100', '110', '150', '220', '380'].forEach(key => KR_COLORS.set(key, 0x55dd00));
['360', '370', '410'].forEach(key => KR_COLORS.set(key, 0xff99bb));
KR_COLORS.set('50',  0xffff99);
KR_COLORS.set('120', 0xcc3355);
KR_COLORS.set('130', 0xffaa33);
KR_COLORS.set('160', 0xbb6600);
KR_COLORS.set('170', 0xffff00);
KR_COLORS.set('180', 0xaaccee);
KR_COLORS.set('190', 0xff3333);
KR_COLORS.set('200', 0xfdbf6f);
KR_COLORS.set('230', 0xbb6600);
KR_COLORS.set('280', 0x5f47a0);
KR_COLORS.set('290', 0xaaccee);
KR_COLORS.set('300', 0x009900);
KR_COLORS.set('390', 0x009900);
KR_COLORS.set('400', 0xcc3355);


/**
 * `KeepRightService`
 *
 * Events available:
 *   `loadedData`
 */
export class KeepRightService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'keepRight';
    this.autoStart = false;

    // persistent data - loaded at init
    this._krData = { errorTypes: {}, localizeStrings: {} };

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
      .then(data => {
        this._krData = data.keepRight;
        this._started = true;
      });
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
      data: {},
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
   * KeepRight API:  http://osm.mueschelsoft.de/keepright/interfacing.php
   */
  loadTiles() {
    const options = {
      format: 'geojson',
      ch: KR_RULES
    };

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

      const [ left, top, right, bottom ] = tile.wgs84Extent.rectangle();
      const params = Object.assign({}, options, { left, bottom, right, top });
      const url = `${KEEPRIGHT_API}/export.php?` + utilQsString(params);
      const controller = new AbortController();

      this._cache.inflightTile[tile.id] = controller;

      fetch(url, { signal: controller.signal })
        .then(utilFetchResponse)
        .then(data => {
          delete this._cache.inflightTile[tile.id];
          this._cache.loadedTile[tile.id] = true;
          if (!data || !data.features || !data.features.length) {
            throw new Error('No Data');
          }

          for (const feature of data.features) {
            const {
              properties: {
                error_type: itemType,
                error_id: id,
                comment = null,
                object_id: objectId,
                object_type: objectType,
                schema,
                title
              }
            } = feature;
            let {
              geometry: { coordinates: loc },
              properties: { description = '' }
            } = feature;

            // if there is a parent, save its error type e.g.:
            //  Error 191 = "highway-highway"
            //  Error 190 = "intersections without junctions"  (parent)
            const issueTemplate = this._krData.errorTypes[itemType];
            const parentIssueType = (Math.floor(itemType / 10) * 10).toString();

            // try to handle error type directly, fallback to parent error type.
            const whichType = issueTemplate ? itemType : parentIssueType;
            const whichTemplate = this._krData.errorTypes[whichType];

            // Rewrite a few of the errors at this point..
            // This is done to make them easier to linkify and translate.
            switch (whichType) {
              case '170':
                description = `This feature has a FIXME tag: ${description}`;
                break;
              case '292':
              case '293':
                description = description.replace('A turn-', 'This turn-');
                break;
              case '294':
              case '295':
              case '296':
              case '297':
              case '298':
                description = `This turn-restriction~${description}`;
                break;
              case '300':
                description = 'This highway is missing a maxspeed tag';
                break;
              case '411':
              case '412':
              case '413':
                description = `This feature~${description}`;
                break;
            }

            // move markers slightly so it doesn't obscure the geometry,
            // then move markers away from other coincident markers
            let coincident = false;
            do {
              // first time, move marker up. after that, move marker right.
              let delta = coincident ? [0.00001, 0] : [0, 0.00001];
              loc = vecAdd(loc, delta);
              let bbox = new Extent(loc).bbox();
              coincident = this._cache.rtree.search(bbox).length;
            } while (coincident);

            const d = new QAItem(this, itemType, id, {
              loc: loc,
              comment: comment,
              description: description,
              whichType: whichType,
              parentIssueType: parentIssueType,
              severity: whichTemplate.severity || 'error',
              objectId: objectId,
              objectType: objectType,
              schema: schema,
              title: title
            });

            d.replacements = this._tokenReplacements(d);

            this._cache.data[id] = d;
            this._cache.rtree.insert(this._encodeIssueRtree(d));
          }

          this.context.deferredRedraw();
          this.emit('loadedData');
        })
        .catch(() => {
          delete this._cache.inflightTile[tile.id];
          this._cache.loadedTile[tile.id] = true;
        });

    }
  }


  /**
   * postUpdate
   * @param  d
   * @param  callback
   */
  postUpdate(d, callback) {
    if (this._cache.inflightPost[d.id]) {
      return callback({ message: 'Error update already inflight', status: -2 }, d);
    }

    const params = { schema: d.schema, id: d.id };

    if (d.newStatus) {
      params.st = d.newStatus;
    }
    if (d.newComment !== undefined) {
      params.co = d.newComment;
    }

    // NOTE: This throws a CORS err, but it seems successful.
    // We don't care too much about the response, so this is fine.
    const url = `${KEEPRIGHT_API}/comment.php?` + utilQsString(params);
    const controller = new AbortController();

    this._cache.inflightPost[d.id] = controller;

    // Since this is expected to throw an error just continue as if it worked
    // (worst case scenario the request truly fails and issue will show up if Rapid restarts)
    fetch(url, { signal: controller.signal })
      .then(utilFetchResponse)
      .finally(() => {
        delete this._cache.inflightPost[d.id];

        if (d.newStatus === 'ignore') {    // ignore permanently (false positive)
          this.removeItem(d);
        } else if (d.newStatus === 'ignore_t') {   // ignore temporarily (error fixed)
          this.removeItem(d);
          this._cache.closed[`${d.schema}:${d.id}`] = true;
        } else {
          d = this.replaceItem(d.update({
            comment: d.newComment,
            newComment: undefined,
            newState: undefined
          }));
        }

        if (callback) callback(null, d);
      });
  }


  /**
   * getError
   * Get a QAItem from cache
   * @param   id
   * @return  QAItem
   */
  getError(id) {
    return this._cache.data[id];
  }


  /**
   * getColor
   * Get the color associated with this issue type
   * @param   parentIssueType
   * @return  hex color
   */
  getColor(parentIssueType) {
    return KR_COLORS.get(parentIssueType) ?? 0xffffff;
  }


  /**
   * replaceItem
   * Replace a single QAItem in the cache
   * @param   item
   * @return  the item, or `null` if it couldn't be replaced
   */
  replaceItem(item) {
    if (!(item instanceof QAItem) || !item.id) return null;

    this._cache.data[item.id] = item;
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

    delete this._cache.data[item.id];
    this._updateRtree(this._encodeIssueRtree(item), false); // false = remove
  }


  /**
   * issueURL
   * Returns the url to link to details about an item
   * @param   item
   * @return  the url
   */
  issueURL(item) {
    return `${KEEPRIGHT_API}/report_map.php?schema=${item.schema}&error=${item.id}`;
  }

  /**
   * getClosedIDs
   * Get an array of issues closed during this session.
   * Used to populate `closed:keepright` changeset tag
   * @return  Array of closed item ids
   */
  getClosedIDs() {
    return Object.keys(this._cache.closed).sort();
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


  _tokenReplacements(d) {
    if (!(d instanceof QAItem)) return;

    const l10n = this.context.systems.l10n;
    const htmlRegex = new RegExp(/<\/[a-z][\s\S]*>/);
    const replacements = {};

    const issueTemplate = this._krData.errorTypes[d.whichType];
    if (!issueTemplate) {
      /* eslint-disable no-console */
      console.log('No Template: ', d.whichType);
      console.log('  ', d.description);
      /* eslint-enable no-console */
      return;
    }

    // some descriptions are just fixed text
    if (!issueTemplate.regex) return;

    // regex pattern should match description with variable details captured
    const errorRegex = new RegExp(issueTemplate.regex, 'i');
    const errorMatch = errorRegex.exec(d.description);
    if (!errorMatch) {
      /* eslint-disable no-console */
      console.log('Unmatched: ', d.whichType);
      console.log('  ', d.description);
      console.log('  ', errorRegex);
      /* eslint-enable no-console */
      return;
    }

    for (let i = 1; i < errorMatch.length; i++) {   // skip first
      let capture = errorMatch[i];
      let idType;

      idType = 'IDs' in issueTemplate ? issueTemplate.IDs[i-1] : '';
      if (idType && capture) {   // link IDs if present in the capture
        capture = this._parseError(capture, idType);
      } else if (htmlRegex.test(capture)) {   // escape any html in non-IDs
        capture = '\\' +  capture + '\\';
      } else {
        const compare = capture.toLowerCase();
        if (this._krData.localizeStrings[compare]) {   // some replacement strings can be localized
          capture = l10n.t('QA.keepRight.error_parts.' + this._krData.localizeStrings[compare]);
        }
      }

      replacements['var' + i] = capture;
    }

    return replacements;
  }


  _parseError(capture, idType) {
    const l10n = this.context.systems.l10n;
    const compare = capture.toLowerCase();

    if (this._krData.localizeStrings[compare]) {   // some replacement strings can be localized
      capture = l10n.t('QA.keepRight.error_parts.' + this._krData.localizeStrings[compare]);
    }

    switch (idType) {
      // link a string like "this node"
      case 'this':
        capture = linkErrorObject(capture);
        break;

      case 'url':
        capture = linkURL(capture);
        break;

      // link an entity ID
      case 'n':
      case 'w':
      case 'r':
        capture = linkEntity(idType + capture);
        break;

      // some errors have more complex ID lists/variance
      case '20':
        capture = parse20(capture);
        break;
      case '211':
        capture = parse211(capture);
        break;
      case '231':
        capture = parse231(capture);
        break;
      case '294':
        capture = parse294(capture);
        break;
      case '370':
        capture = parse370(capture);
        break;
    }

    return capture;


    function linkErrorObject(d) {
      return `<a class="error_object_link">${d}</a>`;
    }

    function linkEntity(d) {
      return `<a class="error_entity_link">${d}</a>`;
    }

    function linkURL(d) {
      return `<a class="kr_external_link" target="_blank" href="${d}">${d}</a>`;
    }

    // arbitrary node list of form: #ID, #ID, #ID...
    function parse211(capture) {
      let newList = [];

      const items = capture.split(', ');
      for (const item of items) {
        const id = linkEntity('n' + item.slice(1));   // ID has # at the front
        newList.push(id);
      }

      return newList.join(', ');
    }

    // arbitrary way list of form: #ID(layer),#ID(layer),#ID(layer)...
    function parse231(capture) {
      let newList = [];

      // unfortunately 'layer' can itself contain commas, so we split on '),'
      const items = capture.split('),');
      for (const item of items) {
        const match = item.match(/\#(\d+)\((.+)\)?/);
        if (match !== null && match.length > 2) {
          newList.push(linkEntity('w' + match[1]) + ' ' +
            l10n.t('QA.keepRight.errorTypes.231.layer', { layer: match[2] })
          );
        }
      }

      return newList.join(', ');
    }

    // arbitrary node/relation list of form: from node #ID,to relation #ID,to node #ID...
    function parse294(capture) {
      let newList = [];
      const items = capture.split(',');

      for (const item of items) {
        const parts = item.split(' ');        // item of form "from/to node/relation #ID"
        const role = `"${parts[0]}"`;         // to/from role is more clear in quotes
        const idType = parts[1].slice(0, 1);  // first letter of node/relation provides the type

        let id = parts[2].slice(1);   // ID has # at the front
        id = linkEntity(idType + id);

        newList.push(`${role} ${parts[1]} ${id}`);
      }

      return newList.join(', ');
    }

    // may or may not include the string "(including the name 'name')"
    function parse370(capture) {
      if (!capture) return '';

      const match = capture.match(/\(including the name (\'.+\')\)/);
      if (match?.length) {
        return l10n.t('QA.keepRight.errorTypes.370.including_the_name', { name: match[1] });
      }
      return '';
    }

    // arbitrary node list of form: #ID,#ID,#ID...
    function parse20(capture) {
      let newList = [];
      const items = capture.split(',');

      for (const item of items) {
        const id = linkEntity('n' + item.slice(1));   // ID has # at the front
        newList.push(id);
      }

      return newList.join(', ');
    }
  }

}
