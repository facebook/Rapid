import { json as d3_json } from 'd3-fetch';
import { Extent, Tiler, vecAdd, vecScale} from '@rapid-sdk/math';
import { utilQsString } from '@rapid-sdk/util';
import RBush from 'rbush';

import { AbstractService } from './AbstractService';
import { QAItem } from '../osm';


const TILEZOOM = 14;
const IMPOSM_API = {
  ow: 'https://grab.community.improve-osm.org/directionOfFlowService',
  mr: 'https://grab.community.improve-osm.org/missingGeoService',
  tr: 'https://grab.community.improve-osm.org/turnRestrictionService'
};

// A mapping of improveOSM error types and their respective tint colors.
const IMPOSM_COLORS = new Map();
IMPOSM_COLORS.set('tr', 0xec1c24);         // turn restrictions
IMPOSM_COLORS.set('ow', 0x1e90ff);         // oneway restrictions
IMPOSM_COLORS.set('mr-road', 0xb452cd);    // missing missing road
IMPOSM_COLORS.set('mr-path', 0xa0522d);    // missing path
IMPOSM_COLORS.set('mr-parking', 0xeeee00); // missing parking
IMPOSM_COLORS.set('mr-both', 0xffa500);    // missing road + parking


/**
 * `ImproveOsmService`
 *
 * Events available:
 *   `loadedData`
 */
export class ImproveOsmService extends AbstractService {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'improveOSM';

    // persistent data - loaded at init
    this._impOsmData = { icons: {} };

    this._cache = null;   // cache gets replaced on init/reset
    this._tiler = new Tiler().zoomRange(TILEZOOM).skipNullIsland(true);
  }


  /**
   * init
   * Called one time after all core objects have been instantiated.
   */
  init() {
    this.reset();

    const dataLoaderSystem = this.context.dataLoaderSystem();
    dataLoaderSystem.get('qa_data')
      .then(d => this._impOsmData = d.improveOSM);
  }


  /**
   * reset
   * Called after completing an edit session to reset any internal state
   */
  reset() {
    if (this._cache) {
      for (const requests of Object.values(this._cache.inflightTile)) {
        this._abortRequest(requests);
      }
    }

    this._cache = {
      data: {},
      loadedTile: {},
      inflightTile: {},
      inflightPost: {},
      closed: {},
      rtree: new RBush()
    };
  }


  /**
   * loadIssues
   * @param  projection
   */
  loadIssues(projection) {
    const options = {
      client: 'Rapid',
      status: 'OPEN',
      zoom: '19' // Use a high zoom so that clusters aren't returned
    };

    // determine the needed tiles to cover the view
    const context = this.context;
    const tiles = this._tiler.getTiles(projection).tiles;

    // abort inflight requests that are no longer needed
    this._abortUnwantedRequests(this._cache, tiles);

    // issue new requests..
    for (const tile of tiles) {
      if (this._cache.loadedTile[tile.id] || this._cache.inflightTile[tile.id]) continue;

      const [ east, north, west, south ] = tile.wgs84Extent.rectangle();
      const params = Object.assign({}, options, { east, south, west, north });

      // 3 separate requests to send for each tile
      const requests = {};
      for (const k of Object.keys(IMPOSM_API)) {
        // We exclude WATER from missing geometry as it doesn't seem useful
        // We use most confident one-way and turn restrictions only, still have false positives
        const kParams = Object.assign({},
          params,
          (k === 'mr') ? { type: 'PARKING,ROAD,BOTH,PATH' } : { confidenceLevel: 'C1' }
        );
        const url = `${IMPOSM_API[k]}/search?` + utilQsString(kParams);
        const controller = new AbortController();

        requests[k] = controller;

        d3_json(url, { signal: controller.signal })
          .then(data => {
            delete this._cache.inflightTile[tile.id][k];
            if (!Object.keys(this._cache.inflightTile[tile.id]).length) {
              delete this._cache.inflightTile[tile.id];
              this._cache.loadedTile[tile.id] = true;
            }

            // Road segments at high zoom == oneways
            if (data.roadSegments) {
              data.roadSegments.forEach(feature => {
                // Position error at the approximate middle of the segment
                const { points, wayId, fromNodeId, toNodeId } = feature;
                const itemId = `${wayId}${fromNodeId}${toNodeId}`;
                let mid = points.length / 2;
                let loc;

                // Even number of points, find midpoint of the middle two
                // Odd number of points, use position of very middle point
                if (mid % 1 === 0) {
                  loc = this._pointAverage([points[mid - 1], points[mid]]);
                } else {
                  mid = points[Math.floor(mid)];
                  loc = [mid.lon, mid.lat];
                }

                // One-ways can land on same segment in opposite direction
                loc = this._preventCoincident(loc, false);

                let d = new QAItem(loc, this, k, itemId, {
                  issueKey: k, // used as a category
                  identifier: { // used to post changes
                    wayId,
                    fromNodeId,
                    toNodeId
                  },
                  objectId: wayId,
                  objectType: 'way'
                });

                // Variables used in the description
                d.replacements = {
                  percentage: feature.percentOfTrips,
                  num_trips: feature.numberOfTrips,
                  highway: this._linkErrorObject(context.t('QA.keepRight.error_parts.highway')),
                  from_node: this._linkEntity('n' + feature.fromNodeId),
                  to_node: this._linkEntity('n' + feature.toNodeId)
                };

                this._cache.data[d.id] = d;
                this._cache.rtree.insert(this._encodeIssueRtree(d));
              });
            }

            // Tiles at high zoom == missing roads
            if (data.tiles) {
              data.tiles.forEach(feature => {
                const { type, x, y, numberOfTrips } = feature;
                const geoType = type.toLowerCase();
                const itemId = `${geoType}${x}${y}${numberOfTrips}`;

                // Average of recorded points should land on the missing geometry
                // Missing geometry could happen to land on another error
                let loc = this._pointAverage(feature.points);
                loc = this._preventCoincident(loc, false);

                let d = new QAItem(loc, this, `${k}-${geoType}`, itemId, {
                  issueKey: k,
                  identifier: { x, y }
                });

                d.replacements = {
                  num_trips: numberOfTrips,
                  geometry_type: context.t(`QA.improveOSM.geometry_types.${geoType}`)
                };

                // -1 trips indicates data came from a 3rd party
                if (numberOfTrips === -1) {
                  d.desc = context.t('QA.improveOSM.error_types.mr.description_alt', d.replacements);
                }

                this._cache.data[d.id] = d;
                this._cache.rtree.insert(this._encodeIssueRtree(d));
              });
            }

            // Entities at high zoom == turn restrictions
            if (data.entities) {
              data.entities.forEach(feature => {
                const { point, id, segments, numberOfPasses, turnType } = feature;
                const itemId = `${id.replace(/[,:+#]/g, '_')}`;

                // Turn restrictions could be missing at same junction
                // We also want to bump the error up so node is accessible
                const loc = this._preventCoincident([point.lon, point.lat], true);

                // Elements are presented in a strange way
                const ids = id.split(',');
                const from_way = ids[0];
                const via_node = ids[3];
                const to_way = ids[2].split(':')[1];

                let d = new QAItem(loc, this, k, itemId, {
                  issueKey: k,
                  identifier: id,
                  objectId: via_node,
                  objectType: 'node'
                });

                // Travel direction along from_way clarifies the turn restriction
                const [ p1, p2 ] = segments[0].points;
                const dir_of_travel = this._cardinalDirection(this._relativeBearing(p1, p2));

                // Variables used in the description
                d.replacements = {
                  num_passed: numberOfPasses,
                  num_trips: segments[0].numberOfTrips,
                  turn_restriction: turnType.toLowerCase(),
                  from_way: this._linkEntity('w' + from_way),
                  to_way: this._linkEntity('w' + to_way),
                  travel_direction: dir_of_travel,
                  junction: this._linkErrorObject(context.t('QA.keepRight.error_parts.this_node'))
                };

                this._cache.data[d.id] = d;
                this._cache.rtree.insert(this._encodeIssueRtree(d));

                this.context.deferredRedraw();
                this.emit('loadedData');
              });
            }
          })
          .catch(e => {
            console.error(e);  // eslint-disable-line
            delete this._cache.inflightTile[tile.id][k];
            if (!Object.keys(this._cache.inflightTile[tile.id]).length) {
              delete this._cache.inflightTile[tile.id];
              this._cache.loadedTile[tile.id] = true;
            }
          });
      }

      this._cache.inflightTile[tile.id] = requests;
    }
  }


  /**
   * getCommentsAsync
   * @param   item
   * @return  Promise
   */
  getCommentsAsync(item) {
    // If comments already retrieved no need to do so again
    if (item.comments) {
      return Promise.resolve(item);
    }

    const key = item.issueKey;
    let qParams = {};

    if (key === 'ow') {
      qParams = item.identifier;
    } else if (key === 'mr') {
      qParams.tileX = item.identifier.x;
      qParams.tileY = item.identifier.y;
    } else if (key === 'tr') {
      qParams.targetId = item.identifier;
    }

    const url = `${IMPOSM_API[key]}/retrieveComments?` + utilQsString(qParams);
    const cacheComments = data => {
      // Assign directly for immediate use afterwards
      // comments are served newest to oldest
      item.comments = data.comments ? data.comments.reverse() : [];
      this.replaceItem(item);
    };

    return d3_json(url).then(cacheComments).then(() => item);
  }


  /**
   * postUpdate
   * @param   d
   * @param   callback
   */
  postUpdate(d, callback) {
    const osm = this.context.services.get('osm');
    if (!osm || !osm.authenticated()) { // Username required in payload
      return callback({ message: 'Not Authenticated', status: -3}, d);
    }
    if (this._cache.inflightPost[d.id]) {
     return callback({ message: 'Error update already inflight', status: -2 }, d);
    }

    // Payload can only be sent once username is established
    osm.userDetails(sendPayload.bind(this));

    function sendPayload(err, user) {
      if (err) { return callback(err, d); }

      const key = d.issueKey;
      const url = `${IMPOSM_API[key]}/comment`;
      const payload = {
        username: user.display_name,
        targetIds: [ d.identifier ]
      };

      if (d.newStatus) {
        payload.status = d.newStatus;
        payload.text = 'status changed';
      }

      // Comment take place of default text
      if (d.newComment) {
        payload.text = d.newComment;
      }

      const controller = new AbortController();
      this._cache.inflightPost[d.id] = controller;

      const options = {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify(payload)
      };

      d3_json(url, options)
        .then(() => {
          delete this._cache.inflightPost[d.id];

          // Just a comment, update error in cache
          if (!d.newStatus) {
            const now = new Date();
            let comments = d.comments ? d.comments : [];

            comments.push({
              username: payload.username,
              text: payload.text,
              timestamp: now.getTime() / 1000
            });

            this.replaceItem(d.update({
              comments: comments,
              newComment: undefined
            }));
          } else {
            this.removeItem(d);
            if (d.newStatus === 'SOLVED') {
              // Keep track of the number of issues closed per type to tag the changeset
              if (!(d.issueKey in this._cache.closed)) {
                this._cache.closed[d.issueKey] = 0;
              }
              this._cache.closed[d.issueKey] += 1;
            }
          }
          if (callback) callback(null, d);
        })
        .catch(e => {
          delete this._cache.inflightPost[d.id];
          if (callback) callback(e.message);
        });
    }
  }


  /**
   * getItems
   * Get all cached QAItems covering the viewport
   * @param   projection
   * @return  Array
   */
  getItems(projection) {
    const viewport = projection.dimensions();
    const min = [viewport[0][0], viewport[1][1]];
    const max = [viewport[1][0], viewport[0][1]];
    const bbox = new Extent(projection.invert(min), projection.invert(max)).bbox();

    return this._cache.rtree.search(bbox).map(d => d.data);
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
   * @param   itemType
   * @return  hex color
   */
  getColor(itemType) {
    return IMPOSM_COLORS.get(itemType) ?? 0xffffff;
  }


  /**
   * getIcon
   * Get the icon to use for the given itemType
   * @param   itemType
   * @return  icon name
   */
  getIcon(itemType) {
    return this._impOsmData.icons[itemType];
  }


  /**
   * replaceItem
   * Replace a single QAItem in the cache
   * @param   item
   * @return  the item, or `null` if it couldn't be replaced
   */
  replaceItem(issue) {
    if (!(issue instanceof QAItem) || !issue.id) return;

    this._cache.data[issue.id] = issue;
    this._updateRtree(this._encodeIssueRtree(issue), true); // true = replace
    return issue;
  }


  /**
   * removeItem
   * Remove a single QAItem from the cache
   * @param   item to remove
   */
  removeItem(issue) {
    if (!(issue instanceof QAItem) || !issue.id) return;

    delete this._cache.data[issue.id];
    this._updateRtree(this._encodeIssueRtree(issue), false); // false = remove
  }


  /**
   * getClosedCounts
   * Used to populate `closed:improveosm:*` changeset tags
   * @return   the closed cache
   */
  getClosedCounts() {
    return this._cache.closed;
  }


  _abortRequest(requests) {
    for (const controller of Object.values(requests)) {
      controller.abort();
    }
  }

  _abortUnwantedRequests(cache, tiles) {
    for (const k of Object.keys(cache.inflightTile)) {
      const wanted = tiles.find(tile => k === tile.id);
      if (!wanted) {
        this._abortRequest(cache.inflightTile[k]);
        delete cache.inflightTile[k];
      }
    }
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

  _linkErrorObject(d) {
    return `<a class="error_object_link">${d}</a>`;
  }

  _linkEntity(d) {
    return `<a class="error_entity_link">${d}</a>`;
  }

  _pointAverage(points) {
    if (points.length) {
      const sum = points.reduce(
        (acc, point) => vecAdd(acc, [point.lon, point.lat]),
        [0,0]
      );
      return vecScale(sum, 1 / points.length);
    } else {
      return [0,0];
    }
  }

  _relativeBearing(p1, p2) {
    let angle = Math.atan2(p2.lon - p1.lon, p2.lat - p1.lat);
    if (angle < 0) {
      angle += 2 * Math.PI;
    }

    // Return degrees
    return angle * 180 / Math.PI;
  }


  // Assuming range [0,360)
  _cardinalDirection(bearing) {
    const dir = 45 * Math.round(bearing / 45);
    const compass = {
      0: 'north',
      45: 'northeast',
      90: 'east',
      135: 'southeast',
      180: 'south',
      225: 'southwest',
      270: 'west',
      315: 'northwest',
      360: 'north'
    };

    return this.context.t(`QA.improveOSM.directions.${compass[dir]}`);
  }


  // Errors shouldn't obscure each other
  _preventCoincident(loc, bumpUp) {
    let coincident = false;
    do {
      // first time, move marker up. after that, move marker right.
      let delta = coincident ? [0.00001, 0] :
          bumpUp ? [0, 0.00001] :
          [0, 0];
      loc = vecAdd(loc, delta);
      let bbox = new Extent(loc).bbox();
      coincident = this._cache.rtree.search(bbox).length;
    } while (coincident);

    return loc;
  }

}
