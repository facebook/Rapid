import { Extent, Tiler, vecAdd } from '@rapid-sdk/math';
import RBush from 'rbush';

import { AbstractSystem } from '../core/AbstractSystem';
import { QAItem } from '../osm/qa_item.js';
import { utilFetchResponse } from '../util';
import { marked } from 'marked';

const TILEZOOM = 14;
const MAPROULETTE_API = 'https://maproulette.org/api/v2';


/**
 * `MapRouletteService`
 *
 * Events available:
 *   'loadedData'
 */
export class MapRouletteService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'maproulette';
    this.autoStart = false;

    this._challengeID = null;  // if we want to filter only a specific challengeID

    this._cache = null;   // cache gets replaced on init/reset
    this._tiler = new Tiler().zoomRange(TILEZOOM).skipNullIsland(true);
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
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    if (this._cache) {
      for (const controller of this._cache.inflight) {
        controller.abort();
      }
    }

    this._cache = {
      lastv: null,
      tasks: new Map(),             // Map (taskID -> Task)
      challenges: new Map(),        // Map (challengeID -> Challenge)
      tileRequest: new Map(),       // Map (tileID -> { status, controller, url })
      challengeRequest: new Map(),  // Map (challengeID -> { status, controller, url })
      inflight: new Map(),          // Map (url -> controller)
      closed: [],                   // Array ({ challengeID, taskID })
      rbush: new RBush()
    };

    return Promise.resolve();
  }


  /**
   * challengeID
   * set/get the challengeID
   */
  get challengeID() {
    return this._challengeID;
  }
  set challengeID(val) {
    if (val === this._challengeID) return;  // no change
    this._challengeID = val;
  }


  /**
   * getData
   * Get already loaded data that appears in the current map view
   * @return  {Array}  Array of data
   */
  getData() {
    const extent = this.context.viewport.visibleExtent();
    return this._cache.rbush.search(extent.bbox())
      .map(d => d.data)
      .filter(task => (this._challengeID && task.parentId === this._challengeID) || (!this._challengeID && task.isVisible));
  }


  /**
   * getTask
   * @param   {string}  taskID
   * @return  {Task?}   the task with that id, or `undefined` if not found
   */
  getTask(taskID) {
    return this._cache.tasks.get(taskID);
  }


  /**
   * getChallenge
   * @param   {string}  challengeID
   * @return  {Task?}   the task with that id, or `undefined` if not found
   */
  getChallenge(challengeID) {
    return this._cache.challenges.get(challengeID);
  }


  /**
   * loadTiles
   * Schedule any data requests needed to cover the current map view
   */
  loadTiles() {
    if (this._paused) return;

    const cache = this._cache;
    const viewport = this.context.viewport;
    if (cache.lastv === viewport.v) return;  // exit early if the view is unchanged
    cache.lastv = viewport.v;

    // Determine the tiles needed to cover the view..
    const tiles = this._tiler.getTiles(viewport).tiles;
    this._abortUnwantedRequests(tiles);

    // Issue new requests..
    for (const tile of tiles) {
      this.loadTile(tile);
    }
  }


  /**
   * loadTile
   * Schedule any data requests needed to cover the current map view
   * @param {object}  tile - Tile to load
   */
  loadTile(tile) {
    const cache = this._cache;
    if (cache.tileRequest.has(tile.id)) return;

    const extent = tile.wgs84Extent;
    const bbox = extent.rectangle().join('/');  // minX/minY/maxX/maxY
    const url = `${MAPROULETTE_API}/tasks/box/${bbox}`;

    const controller = new AbortController();
    cache.inflight.set(url, controller);
    cache.tileRequest.set(tile.id, { status: 'inflight', controller: controller, url: url });

    fetch(url, { signal: controller.signal })
      .then(utilFetchResponse)
      .then(data => {
        cache.tileRequest.set(tile.id, { status: 'loaded' });

        for (const task of (data ?? [])) {
          const taskID = task.id.toString();
          const challengeID = task.parentId.toString();
          if (cache.tasks.has(taskID)) continue;  // seen it already

          // Have we seen this challenge before?
          const challenge = cache.challenges.get(challengeID);
          if (!challenge) {
            cache.challengeRequest.set(challengeID, {});  // queue fetching it
            task.isVisible = false;
          } else {
            task.isVisible = challenge.isVisible;
          }

          task.id = taskID;               // force to string
          task.parentId = challengeID;    // force to string
          task.loc = this._preventCoincident([task.point.lng, task.point.lat]);

          // save the task
          const d = new QAItem(this, null, taskID, task);
          cache.tasks.set(taskID, d);
          cache.rbush.insert(this._encodeIssueRbush(d));
        }

        this.loadChallenges();   // call this sometimes
      })
      .catch(err => {
        if (err.name === 'AbortError') {
          cache.tileRequest.delete(tile.id);  // allow retry
        } else {  // real error
          console.error(err);  // eslint-disable-line
          cache.tileRequest.set(tile.id, { status: 'error' });  // don't retry
        }
      })
      .finally(() => {
        cache.inflight.delete(url);
      });
  }



  /**
   * loadChallenges
   * Schedule any data requests needed for challenges we are interested in
   */
  loadChallenges() {
    if (this._paused) return;

    const cache = this._cache;

    for (const [challengeID, val] of cache.challengeRequest) {
      if (val.status) return;  // processed already

      const url = `${MAPROULETTE_API}/challenge/${challengeID}`;

      const controller = new AbortController();
      cache.inflight.set(url, controller);
      cache.challengeRequest.set(challengeID, { status: 'inflight', controller: controller, url: url });

      fetch(url, { signal: controller.signal })
        .then(utilFetchResponse)
        .then(challenge => {
          cache.challengeRequest.set(challengeID, { status: 'loaded' });

          challenge.isVisible = challenge.enabled && !challenge.deleted;

          // update task statuses
          for (const task of cache.tasks.values()) {
            if (task.parentId === challengeID) {
              task.isVisible = challenge.isVisible;
            }
          }

          // save the challenge
          cache.challenges.set(challengeID, challenge);

          this.context.deferredRedraw();
          this.emit('loadedData');
        })
        .catch(err => {
          if (err.name === 'AbortError') {
            cache.challengeRequest.delete(challengeID);  // allow retry
          } else {  // real error
            console.error(err);  // eslint-disable-line
            cache.challengeRequest.set(challengeID, { status: 'error' });  // don't retry
          }
        })
        .finally(() => {
          cache.inflight.delete(url);
        });
    }
  }



  /**
   * loadTaskDetailAsync
   * @param   task
   * @return  Promise
   */
  loadTaskDetailAsync(task) {
    if (task.description !== undefined) return Promise.resolve(task);  // already done

    const url = `${MAPROULETTE_API}/challenge/${task.parentId}`;
    const handleResponse = (data) => {
      task.instruction = marked.parse(data.instruction) || '';
      task.description = marked.parse(data.description) || '';
      return task;
    };

    return fetch(url)
      .then(utilFetchResponse)
      .then(handleResponse);
  }


  /**
   * postUpdate
   * @param   task
   * @param   callback
   */
  postUpdate(task, callback) {
    const context = this.context;
    const cache = this._cache;

    // A comment is optional, but if we have one, POST it..
    const commentUrl = `${MAPROULETTE_API}/task/${task.id}/comment`;
    if (task.comment && !cache.inflight.has(commentUrl)) {
      const commentController = new AbortController();
      cache.inflight.set(commentUrl, commentController);

      fetch(commentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apiKey': task.mapRouletteApiKey
        },
        body: JSON.stringify({ actionId: 2, comment: task.comment }),
        signal: commentController.signal
      })
      .then(utilFetchResponse)
      .catch(err => {
        if (err.name === 'AbortError') {
          return;  // ok
        } else {  // real error
          console.error(err);  // eslint-disable-line
        }
      })
      .finally(() => {
        cache.inflight.delete(commentUrl);
      });
    }

    // update the status and release the task
    const updateTaskUrl = `${MAPROULETTE_API}/task/${task.id}/${task.taskStatus}`;
    const releaseTaskUrl = `${MAPROULETTE_API}/task/${task.id}/release`;

    if (!cache.inflight.has(updateTaskUrl) && !cache.inflight.has(releaseTaskUrl)) {
      const updateTaskController = new AbortController();
      const releaseTaskController = new AbortController();
      cache.inflight.set(updateTaskUrl, updateTaskController);
      cache.inflight.set(releaseTaskUrl, releaseTaskController);

      fetch(updateTaskUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apiKey': task.mapRouletteApiKey
        },
        signal: updateTaskController.signal
      })
      .then(utilFetchResponse)
      .then(() => {
        return fetch(releaseTaskUrl, {
          signal: releaseTaskController.signal,
          headers: {
            'apiKey': task.mapRouletteApiKey
          }
        });
      })
      .then(utilFetchResponse)
      .then(() => {
        // All requests completed successfully
        if (task.taskStatus === 1) {  // only counts if the use chose "I Fixed It".
          this._cache.closed.push({ taskID: task.id, challengeID: task.parentId });
        }

// commit.js will take care of the changeset comment
//        if (!(task.id in this._cache.closed)) {
//          this._cache.closed[task.id] = 0;
//          if (task.comment) {
//            task.comment += ` #maproulette mpr.lt/c/${task.parentId}/t/${task.id}`;
//            this._cache.comment[task.id] = { id: task.id, comment: task.comment };
//          }
//        }
//        this._cache.closed[task.id] += 1;
        this.removeTask(task);
        this.context.enter('browse');
        if (callback) callback(null, task);
      })
      .catch(err => {
        if (err.name === 'AbortError') {
          return;  // ok
        } else {  // real error
          console.error(err);  // eslint-disable-line
          if (callback) callback(err.message);
        }
      })
      .finally(() => {
        cache.inflight.delete(updateTaskUrl);
        cache.inflight.delete(releaseTaskUrl);
      });
    }
  }


  /**
   * getError
   * Get a Task from cache
   * @param   taskID
   * @return  Task
   */
  getError(taskID) {
    return this._cache.tasks.get(taskID);
  }


  /**
   * replaceTask
   * Replace a single Task in the cache
   * @param   task
   * @return  the task, or `null` if it couldn't be replaced
   */
  replaceTask(task) {
    if (!(task instanceof QAItem) || !task.id) return;

    this._cache.tasks.set(task.id, task);
    this._updateRbush(this._encodeIssueRbush(task), true); // true = replace
    return task;
  }


  /**
   * removeTask
   * Remove a single Task from the cache
   * @param   task to remove
   */
  removeTask(task) {
    if (!(task instanceof QAItem) || !task.id) return;
    this._cache.tasks.delete(task.id);
    this._updateRbush(this._encodeIssueRbush(task), false);
  }


  /**
   * getClosed
   * Get details about all taskks closed in this session
   * @return  Array of objects
   */
  getClosed() {
    return this._cache.closed;
  }


  /**
   * itemURL
   * Returns the url to link to task about a challenge
   * @param   task
   * @return  the url
   */
  itemURL(task) {
    return `https://maproulette.org/challenge/${task.parentId}/task/${task.id}`;
  }


  _abortUnwantedRequests(tiles) {
    const cache = this._cache;
    for (const [tileID, request] of cache.tileRequest) {
      if (request.status !== 'inflight') continue;
      const wanted = tiles.find(tile => tile.id === tileID);
      if (!wanted) {
        request.controller.abort();
        cache.inflight.delete(request.url);
      }
    }
  }


  _encodeIssueRbush(d) {
    return { minX: d.loc[0], minY: d.loc[1], maxX: d.loc[0], maxY: d.loc[1], data: d };
  }


  // Replace or remove Task from rbush
  _updateRbush(task, replace) {
    this._cache.rbush.remove(task, (a, b) => a.data.id === b.data.id);
    if (replace) {
      this._cache.rbush.insert(task);
    }
  }


  // Markers shouldn't obscure each other
  _preventCoincident(loc) {
    let coincident = false;
    do {
      // first time, move marker up. after that, move marker right.
      let delta = coincident ? [0.00001, 0] : [0, 0.00001];
      loc = vecAdd(loc, delta);
      const bbox = new Extent(loc).bbox();
      coincident = this._cache.rbush.search(bbox).length;
    } while (coincident);

    return loc;
  }
}
