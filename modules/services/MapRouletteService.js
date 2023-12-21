import { Extent, Tiler, vecAdd } from '@rapid-sdk/math';
import RBush from 'rbush';

import { AbstractSystem } from '../core/AbstractSystem';
import { Task } from '../maproulette/Task';
import { utilFetchResponse } from '../util';


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
    this.challengeId = '';
    this.autoStart = false;

    this._taskData = { icons: {}, types: [] };
    this._maprouletteStrings = new Map();   // Map (locale -> Object containing strings)

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
    // this._loadStringsAsync()
    //   .then(() => this._started = true);
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
  loadTiles(redraw = false) {
    if (redraw) {
      this._cache.tasks = new Map();
      this._cache.rtree = new RBush();
    }
    // determine the needed tiles to cover the view
    const projection = this.context.projection;
    const tiles = this._tiler.getTiles(projection).tiles;

    // abort inflight requests that are no lnger needed
    this._abortUnwantedRequests(this._cache, tiles);

    // issue new requests..
    for (const tile of tiles) {
      if ((this._cache.loadedTile[tile.id] || this._cache.inflightTile[tile.id]) && !redraw) continue;

      const extent = this.context.systems.map.extent();
      const bbox = extent.bbox();


      // const urlBboxSpecifier = `${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}`;
      // const url = `${MAPROULETTE_API}/challenges/extendedFind?bb=${encodeURIComponent(urlBboxSpecifier)}&cLocal=0&ce=true&limit=50&order=DESC&page=0&pe=true&sort=popularity`;
      // const url = `${MAPROULETTE_API}/taskCluster?cLocal=0&cStatus=${encodeURIComponent('3,4,0,-1')}&ce=true&invf=&pe=true&points=25&tbb=${encodeURIComponent(urlBboxSpecifier)}`;
      // const url =  `${MAPROULETTE_API}/tasks/box/${urlBboxSpecifier}?cStatus=${encodeURIComponent('3,4,0,-1')}${this.challengeId.length > 0 ? '&parentid='+this.challengeId : ''}`;

      const urlBboxSpecifier = `${bbox.minX}/${bbox.minY}/${bbox.maxX}/${bbox.maxY}`;
      const url =  `${MAPROULETTE_API}/tasks/box/${urlBboxSpecifier}?sort=parent_id&order=DESC&cStatus=${encodeURIComponent('0,3')}${this.challengeId.length > 0 ? '&cid='+this.challengeId : ''}`; // Presumably the parent_id (that is, Challenge ID) will be auto-incremental for new Challenges, and thus a DESC Sort will give priority to loading newer challenges from the API first. This is done so that older, deleted challenges are left out.
    
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
              // let loc = [task.location.coordinates[1], task.location.coordinates[0]];
              let loc = [task.point.lng, task.point.lat];
              loc = this._preventCoincident(loc);

              let d = new Task(loc, this, id, { task });

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
    // Issue details only need to be fetched once
    if (task.elems !== undefined) return Promise.resolve(task);

    const localeCode = this.context.systems.l10n.localeCode();
    // const url = `${MAPROULETTE_API}/task/${task.id}?langs=${localeCode}`;
    const url = `${MAPROULETTE_API}/challenge/${task.task.parentId}`;
    const handleResponse = (data) => {
      // Associated elements used for highlighting
      // Assign directly for immediate use in the callback
      task.details = data;
      this.replaceTask(task);
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


  /***
   * postUpdate
   * @param   issue
   * @param   callback
   */
  postUpdate(issue, callback) {
    if (this._cache.inflightPost[issue.id]) {
      return callback({ message: 'Issue update already inflight', status: -2 }, issue);
    }

    // UI sets the status to either 'done' or 'false'
    const url = `${MAPROULETTE_API}/issue/${issue.id}/${issue.newStatus}`;
    const controller = new AbortController();
    const after = () => {
      delete this._cache.inflightPost[issue.id];

      this.removeTask(issue);
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
    if (!(task instanceof Task) || !task.id) return;

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
    if (!(task instanceof Task) || !task.id) return;

    this._cache.isseus.delete(task.id);
    this._updateRtree(this._encodeIssueRtree(task), false); // false = remove
  }


  /**
   * getClosedCounts
   * Used to populate closed changeset tags
   * @return   the closed cache
   */
  getClosedCounts() {
    return this._cache.closed;
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

  /**
   * itemURL
   * Returns the url to link to details about an item
   * @param   item
   * @return  the url
   */
  itemURL(item) {
    // return `https://maproulette.org/challenge/${item.task.parentId}/task/${item.id}`; // To look at a specific task, the user must be signed into their MR account. As of Dec 21 MR does not offer an automatic sign-in redirect.
    return `https://maproulette.org/challenge/${item.task.parentId}`; // We use this for now because we can't be sure if user is signed in or not.
  }

  /**
   * challengeId
   * set/get the MapRoulette challengeId by which to filter the tasks
   */
    getChallengeId() {
      return this.challengeId;
    }
    setChallengeId(val) {
      this.challengeId = val;
      this.loadTiles(true);
    }

}
