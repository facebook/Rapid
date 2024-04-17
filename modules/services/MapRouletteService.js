import { Extent, Tiler, vecAdd } from '@rapid-sdk/math';
import RBush from 'rbush';

import { AbstractSystem } from '../core/AbstractSystem';
import { Task as MapRouletteTask } from '../maproulette/Task';
import { utilFetchResponse } from '../util';
import { marked } from 'marked';

const TILEZOOM = 14;
const MAPROULETTE_API = 'https://maproulette.org/api/v2';


/**
 * `MapRouletteService`

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

    this._taskData = { icons: {}, types: [] };

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
      Object.values(this._cache.inflightTile).forEach(controller => this._abortRequest(controller));
    }
    this._cache = {
      tasks: new Map(),    // Map (taskID -> Task)
      loadedTile: {},
      inflightTile: {},
      inflightPost: {},
      closed: {},
      rtree: new RBush()
    };

    return Promise.resolve();
  }


  /**
   * getData
   * Get already loaded data that appears in the current map view
   * @return  {Array}  Array of data
   */
  getData() {
    const extent = this.context.systems.map.extent();
    return this._cache.rtree.search(extent.bbox()).map(d => d.data);
  }


  /**
   * loadTiles
   * Schedule any data requests needed to cover the current map view
   */
  loadTiles() {
    // determine the needed tiles to cover the view
    const projection = this.context.projection;
    const tiles = this._tiler.getTiles(projection).tiles;

    // abort inflight requests that are no longer needed
    this._abortUnwantedRequests(this._cache, tiles);

    // issue new requests..
    for (const tile of tiles) {
      if (this._cache.loadedTile[tile.id] || this._cache.inflightTile[tile.id]) continue;

      const extent = this.context.systems.map.extent();
      const bbox = extent.bbox();

      const urlBboxSpecifier = `${bbox.minX}/${bbox.minY}/${bbox.maxX}/${bbox.maxY}`;

      const url = `${MAPROULETTE_API}/tasks/box/` + urlBboxSpecifier;

      const controller = new AbortController();
      this._cache.inflightTile[tile.id] = controller;

      fetch(url, { signal: controller.signal })
        .then(utilFetchResponse)
        .then(data => {
          this._cache.loadedTile[tile.id] = true;

          for (const task of (data ?? [])) {
            // MapRoulette tasks are uniquely identified by an
            // `id`
              const id = task.id;
              let loc = [task.point.lng, task.point.lat];
              loc = this._preventCoincident(loc);

              let d = new MapRouletteTask(loc, this, id, { task });

              this._cache.tasks.set(d.id, d);
              this._cache.rtree.insert(this._encodeIssueRtree(d));
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
   * loadTaskDetailAsync
   * @param   task
   * @return  Promise
   */
  loadTaskDetailAsync(task) {
    if (task.details !== undefined) return Promise.resolve(task);
    const url = `${MAPROULETTE_API}/challenge/${task.task.parentId}`;
    const handleResponse = (data) => {
      task.instruction = marked.parse(data.instruction) || '';
      task.details = marked.parse(data.description) || '';
    };

    return fetch(url)
      .then(utilFetchResponse)
      .then(handleResponse)
      .then(() => task);
  }


  /**
   * getIcon
   * Get the default icon to use
   * @return  icon name
   */
  getIcon() {
    return 'maki-circle-stroked';
  }


  /**
   * postUpdate
   * @param   task
   * @param   callback
   */
  postUpdate(task, callback) {
    console.log('postUpdate called with task:', task);

    if (this._cache.inflightPost[task.id]) {
      console.log('Issue update already inflight for task:', task);
      return callback({ message: 'Issue update already inflight', status: -2 }, task);
    }

    const commentUrl = `${MAPROULETTE_API}/task/${task.id}/comment`;
    const userUrl = `${MAPROULETTE_API}/user/${task.userId}`;
    const releaseTaskUrl = `${MAPROULETTE_API}/task/${task.taskId}/release`;
    const controller = new AbortController();

    this._cache.inflightPost[task.id] = controller;

    // Post comment
    fetch(commentUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId: 2, text: task.comment }),
      signal: controller.signal
    })
    .then(response => {
      if (!response.ok) throw new Error(`Error posting comment: ${response.statusText}`);
      return response.json();
    })
    .then(() => {
      // Get user
      return fetch(userUrl, { signal: controller.signal });
    })
    .then(response => {
      if (!response.ok) throw new Error(`Error getting user: ${response.statusText}`);
      return response.json();
    })
    .then(() => {
      // Release task
      return fetch(releaseTaskUrl, { signal: controller.signal });
    })
    .then(response => {
      if (!response.ok) throw new Error(`Error releasing task: ${response.statusText}`);
      return response.json();
    })
    .then(() => {
      // All requests completed successfully
      delete this._cache.inflightPost[task.id];
      this.removeItem(task);
      if (task.newStatus === 'done') {
        console.log('Task marked as done:', task);
        if (!(task.item in this._cache.closed)) {
          console.log('Adding new item to closed cache:', task.item);
          this._cache.closed[task.item] = 0;
        }
        this._cache.closed[task.item] += 1;
        console.log('Updated closed cache:', this._cache.closed);
      }
      if (callback) callback(null, task);
    })
    .catch(err => {
      // Handle any errors
      delete this._cache.inflightPost[task.id];
      if (callback) callback(err.message);
    });
  }


  /**
   * getError
   * Get a Task from cache
   * @param   issueID
   * @return  Task
   */
  getError(issueID) {
    return this._cache.tasks.get(issueID);
  }


  /**
   * replaceTask
   * Replace a single Task in the cache
   * @param   task
   * @return  the task, or `null` if it couldn't be replaced
   */
  replaceTask(task) {
    if (!(task instanceof MapRouletteTask) || !task.id) return;

    this._cache.tasks.set(task.id, task);
    this._updateRtree(this._encodeIssueRtree(task), true); // true = replace
    return task;
  }


  /**
   * removeTask
   * Remove a single Task from the cache
   * @param   task to remove
   */
  removeTask(task) {
    if (!(task instanceof MapRouletteTask) || !task.id) return;

    this._cache.isseus.delete(task.id);
    this._updateRtree(this._encodeIssueRtree(task), false); // false = remove
  }


  /**
   * getClosedCounts
   * Used to populate `closed:maproulette:*` changeset tags
   * @return   the closed cache
   */
  getClosedCounts() {
    return this._cache.closed;
  }

    /**
   * itemURL
   * Returns the url to link to task about a challenge
   * @param   task
   * @return  the url
   */
  itemURL(task) {
    return `https://maproulette.org/challenge/${task.task.parentId}/task/${task.id}`;
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

  // Replace or remove Task from rtree
  _updateRtree(task, replace) {
    this._cache.rtree.remove(task, (a, b) => a.data.id === b.data.id);
    if (replace) {
      this._cache.rtree.insert(task);
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

}
