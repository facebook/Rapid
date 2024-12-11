import { Tiler, vecSubtract } from '@rapid-sdk/math';
import RBush from 'rbush';

import { AbstractSystem } from '../core/AbstractSystem';
import { QAItem } from '../osm/qa_item.js';
import { utilFetchResponse } from '../util';
import { marked } from 'marked';

const TILEZOOM = 14;
const MAPROULETTE_API = 'https://maproulette.org/api/v2';


/**
 * `MapRouletteService`
 * MapRoulette is a microtask platform for performing tasks to improve OpenStreetMap.
 * This service connects to the MapRoulette API to fetch about challenges and tasks.
 * @see https://wiki.openstreetmap.org/wiki/MapRoulette
 * @see https://maproulette.org/docs/swagger-ui/index.html
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

    this._initPromise = null;
    this._challengeIDs = new Set();  // Set<string> - if we want to filter only a specific challengeID

    this._cache = null;   // cache gets replaced on init/reset
    this._tiler = new Tiler().zoomRange(TILEZOOM).skipNullIsland(true);

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._hashchange = this._hashchange.bind(this);
    this._mapRouletteChanged = this._mapRouletteChanged.bind(this);
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    if (this._initPromise) return this._initPromise;

    const context = this.context;
    const gfx = context.systems.gfx;
    const urlhash = context.systems.urlhash;

    const prerequisites = Promise.all([
      gfx.initAsync(),   // `gfx.scene` will exist after `initAsync`
      urlhash.initAsync()
    ]);

    return this._initPromise = prerequisites
      .then(() => this.resetAsync())
      .then(() => {
        // Setup event handlers..
        gfx.scene.on('layerchange', this._mapRouletteChanged);
        urlhash.on('hashchange', this._hashchange);
      });
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
   * set/get the challengeIDs (as a string of comma-separated values)
   */
  get challengeIDs() {
    return [...this._challengeIDs].join(',');
  }

  set challengeIDs(ids = '') {
    const str = ids.toString();
    const vals = str.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    // Keep only values that are numeric, reject things like NaN, null, Infinity
    this._challengeIDs.clear();
    for (const val of vals) {
      const num = +val;
      const valIsNumber = (!isNaN(num) && isFinite(num));
      if (valIsNumber) {
        this._challengeIDs.add(val);  // keep the string
      }
    }
    const gfx = this.context.systems.gfx;
    gfx.immediateRedraw();
    this._mapRouletteChanged();
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
      .filter(task => {
        if (this._challengeIDs.size) {
          return this._challengeIDs.has(task.parentId);  // ignore isVisible if it's in the list
        } else {
          return task.isVisible;
        }
      });
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
          task.loc = this._preventCoincident(cache.rbush, [task.point.lng, task.point.lat]);

          // save the task
          const d = new QAItem(this, null, taskID, task);
          cache.tasks.set(taskID, d);
          cache.rbush.insert(this._encodeIssueRBush(d));
        }

        this.loadChallenges();   // call this sometimes
      })
      .catch(err => {
        if (err.name === 'AbortError') {
          cache.tileRequest.delete(tile.id);  // allow retry
        } else {  // real error
          console.error(err);    // eslint-disable-line no-console
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

          const gfx = this.context.systems.gfx;
          gfx.deferredRedraw();
          this.emit('loadedData');
        })
        .catch(err => {
          if (err.name === 'AbortError') {
            cache.challengeRequest.delete(challengeID);  // allow retry
          } else {  // real error
            console.error(err);    // eslint-disable-line no-console
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
          console.error(err);    // eslint-disable-line no-console
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
        this.removeTask(task);
        this.context.enter('browse');
        if (callback) callback(null, task);
      })
      .catch(err => {
        if (err.name === 'AbortError') {
          return;  // ok
        } else {  // real error
          console.error(err);    // eslint-disable-line no-console
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
    this._updateRBush(this._encodeIssueRBush(task), true); // true = replace
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
    this._updateRBush(this._encodeIssueRBush(task), false);
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
   * flyToNearbyTask
   * Initiates the process to find and fly to a nearby task based on the current task's challenge ID and task ID.
   * @param {Object} task - The current task object containing task details.
   */
  flyToNearbyTask(task) {
    if (!this.nearbyTaskEnabled) return;
    const challengeID = task.parentId;
    const taskID = task.id;
    if (!challengeID || !taskID) return;
    this.filterNearbyTasks(challengeID, taskID);
  }


  /**
   * getChallengeDetails
   * Retrieves challenge details from cache or API.
   * @param {string} challengeID - The ID of the challenge.
   * @returns {Promise} Promise resolving with challenge data.
   */
  getChallengeDetails(challengeID) {
    const cachedChallenge = this._cache.challenges.get(challengeID);
    if (cachedChallenge) {
      return Promise.resolve(cachedChallenge);
    } else {
      const challengeUrl = `${MAPROULETTE_API}/challenge/${challengeID}`;
      return fetch(challengeUrl)
        .then(utilFetchResponse);
    }
  }


  /**
   * filterNearbyTasks
   * Fetches nearby tasks for a given challenge and task ID, and flies to the nearest task.
   * @param {string} challengeID - The ID of the challenge.
   * @param {string} taskID - The ID of the current task.
   * @param {number} [zoom] - Optional zoom level for the map.
   */
  filterNearbyTasks(challengeID, taskID, zoom) {
    const nearbyTasksUrl = `${MAPROULETTE_API}/challenge/${challengeID}/tasksNearby/${taskID}?excludeSelfLocked=true&limit=1`;
    if (!taskID) return;
    fetch(nearbyTasksUrl)
      .then(utilFetchResponse)
      .then(nearbyTasks => {
        if (nearbyTasks.length > 0) {
          const nearestTaskData = nearbyTasks[0];
          nearestTaskData.parentId = nearestTaskData.parent.toString();
          return this.getChallengeDetails(challengeID)
            .then(challengeData => {
              // Set the title and parentName using the challenge name
              nearestTaskData.title = challengeData.name;
              nearestTaskData.parentName = challengeData.name;

              // Create a new QAItem with the updated title and parentName
              const nearestTask = new QAItem(this, null, nearestTaskData.id.toString(), nearestTaskData);
              const [lng, lat] = nearestTask.location.coordinates;

              const map = this.context.systems.map;
              if (map) {
                map.centerZoomEase([lng, lat], zoom);
                this.selectAndDisplayTask(nearestTask);
              }
            });
      }
    })
    .catch(err => {
      console.error('Error fetching nearby tasks for challenge:', challengeID, err);  // eslint-disable-line no-console
    });
  }


  /**
   * selectAndDisplayTask
   * Selects a task and updates the sidebar reflect the selection
   * @param {QAItem} task - The task to be selected
   */
  selectAndDisplayTask(task) {
    const maproulette = this.context.services.maproulette;
    if (maproulette) {
      if (!(task instanceof QAItem)) return;

      maproulette.currentTask = task;
      const selection = new Map();
      selection.set(task.id, task);
      this.context.enter('select', { selection });
    }
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


  _encodeIssueRBush(d) {
    return { minX: d.loc[0], minY: d.loc[1], maxX: d.loc[0], maxY: d.loc[1], data: d };
  }


  // Replace or remove Task from rbush
  _updateRBush(task, replace) {
    this._cache.rbush.remove(task, (a, b) => a.data.id === b.data.id);
    if (replace) {
      this._cache.rbush.insert(task);
    }
  }


  /**
   * _preventCoincident
   * This checks if the cache already has something at that location, and if so, moves down slightly.
   * @param   {RBush}          rbush - the spatial cache to check
   * @param   {Array<number>}  loc   - original [longitude,latitude] coordinate
   * @return  {Array<number>}  Adjusted [longitude,latitude] coordinate
   */
  _preventCoincident(rbush, loc) {
    for (let dy = 0; ; dy++) {
      loc = vecSubtract(loc, [0, dy * 0.00001]);
      const box = { minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1] };
      if (!rbush.collides(box)) {
        return loc;
      }
    }
  }


  /**
   * _hashchange
   * Respond to any changes appearing in the url hash
   * @param  currParams   Map(key -> value) of the current hash parameters
   * @param  prevParams   Map(key -> value) of the previous hash parameters
   */
  _hashchange(currParams, prevParams) {
    const scene = this.context.systems.gfx.scene;

    // maproulette
    // Support opening maproulette layer with a URL parameter:
    //  e.g. `maproulette=true`  -or-
    //  e.g. `maproulette=<challengeIDs>`
    const newVal = currParams.get('maproulette') || '';
    const oldVal = prevParams.get('maproulette') || '';
    if (newVal !== oldVal) {
      let isEnabled = false;

      this._challengeIDs.clear();
      const vals = newVal.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      for (const val of vals) {
        if (val === 'true') {
          isEnabled = true;
          continue;
        }
        // Try the value as a number, but reject things like NaN, null, Infinity
        const num = +val;
        const valIsNumber = (!isNaN(num) && isFinite(num));
        if (valIsNumber) {
          isEnabled = true;
          this._challengeIDs.add(val);  // keep the string
        }
      }

      if (isEnabled) {  // either of these will trigger 'layerchange'
        scene.enableLayers('maproulette');
      } else {
        scene.disableLayers('maproulette');
      }
    }
  }


  /**
   * _mapRouletteChanged
   * Push changes in MapRoulette state to the urlhash
   */
  _mapRouletteChanged() {
    const context = this.context;
    const urlhash = context.systems.urlhash;
    const scene = context.systems.gfx.scene;
    const layer = scene.layers.get('maproulette');

    // `maproulette=true` -or- `maproulette=<challengeIDs>`
    if (layer?.enabled) {
      const ids = this.challengeIDs;
      if (ids) {
        urlhash.setParam('maproulette', ids);
      } else {
        urlhash.setParam('maproulette', 'true');
      }
    } else {
      urlhash.setParam('maproulette', null);
    }
  }
}
