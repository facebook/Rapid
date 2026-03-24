import { Extent } from '@rapid-sdk/math';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { Graph, Tree, RapidDataset } from '../core/lib/index.js';


// PMTiles archive URL for Meta ML road geometries
const ML_ROADS_PMTILES_URL = 'https://rapideditor.org/country_exports/global_ml_roads.pmtiles';

// Minimum zoom level for loading road data (matches the archive's single zoom level)
const MIN_ROAD_ZOOM = 14;

// Maximum features to process per render frame (prevents main thread blocking)
const MAX_FEATURES_PER_FRAME = 500;

// Overture/ML class values that map to non-motorized highways
const NON_MOTORIZED_CLASSES = new Set([
  'footway', 'cycleway', 'path', 'pedestrian', 'bridleway', 'steps', 'corridor'
]);


/**
 * `MapWithAIService`
 * This service provides Meta ML road datasets from PMTiles archives,
 * using client-side conflation via `PMTilesService`.
 *
 * Provides two datasets:
 *   - `fbRoads` — ML-detected road geometries from a global PMTiles archive
 *   - `rapid_intro_graph` — Tutorial roads for the Rapid walkthrough (hidden)
 *
 * Events available:
 *   `loadedData`
 */
export class MapWithAIService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'mapwithai';
    this._initPromise = null;

    this._mlRoadsGraph = null;
    this._mlRoadsTree = null;
    this._mlRoadsCache = { seen: new Set() };

    // rapid_intro_graph resources (allocated in initAsync)
    this._introDataset = null;
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    if (this._initPromise) return this._initPromise;

    const pmtilesService = this.context.services.pmtiles;

    return this._initPromise = pmtilesService.initAsync()
      .then(() => {
        // Allocate a special dataset for the rapid intro graph (tutorial)
        const datasetID = 'rapid_intro_graph';
        const graph = new Graph();
        const tree = new Tree(graph);
        const cache = { seen: new Set() };
        this._introDataset = {
          id: datasetID,
          graph: graph,
          tree: tree,
          cache: cache,
          lastv: null
        };
      });
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    this._started = true;

    // When new OSM data is merged into the editor (e.g. after a changeset upload
    // and fresh tile fetch), invalidate the conflation caches so that newly added
    // OSM roads will be detected on the next render pass.
    const editor = this.context.systems.editor;
    editor.on('merge', () => this._invalidateConflationCaches());

    const pmtilesService = this.context.services.pmtiles;
    return pmtilesService.startAsync();
  }


  /**
   * _invalidateConflationCaches
   * Clear the "seen" set and internal graph/tree so that all ML road features
   * get re-conflated against the latest OSM graph on the next render pass.
   */
  _invalidateConflationCaches() {
    if (this._mlRoadsCache) {
      this._mlRoadsCache.seen.clear();
    }
    this._mlRoadsGraph = null;
    this._mlRoadsTree = null;
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    this._mlRoadsGraph = null;
    this._mlRoadsTree = null;
    this._mlRoadsCache = { seen: new Set() };

    // Reset intro graph if it exists
    if (this._introDataset) {
      this._introDataset.graph = new Graph();
      this._introDataset.tree = new Tree(this._introDataset.graph);
      this._introDataset.cache = { seen: new Set() };
      this._introDataset.lastv = null;
    }

    return Promise.resolve();
  }


  /**
   * getAvailableDatasets
   * Called by `RapidSystem` to get the datasets that this service provides.
   * @return {Array<RapidDataset>}  The datasets this service provides
   */
  getAvailableDatasets() {
    const context = this.context;

    const fbRoads = new RapidDataset(context, {
      id: 'fbRoads',
      conflated: false,
      service: 'mapwithai',
      categories: new Set(['meta', 'roads', 'featured']),
      color: '#da26d3',
      dataUsed: ['mapwithai', 'Facebook Roads'],
      itemUrl: 'https://github.com/facebookmicrosites/Open-Mapping-At-Facebook',
      licenseUrl: 'https://rapideditor.org/doc/license/MapWithAILicense.pdf',
      labelStringID: 'rapid_menu.fbRoads.label',
      descriptionStringID: 'rapid_menu.fbRoads.description'
    });

    const introGraph = new RapidDataset(context, {
      id: 'rapid_intro_graph',
      hidden: true,
      conflated: false,
      service: 'mapwithai',
      categories: new Set(['meta', 'roads']),
      color: '#da26d3',
      dataUsed: [],
      label: 'Rapid Walkthrough'
    });

    return [fbRoads, introGraph];
  }


  /**
   * loadTiles
   * Use the PMTiles service to schedule any data requests needed to cover the current map view
   * @param   {string}  datasetID - dataset to load tiles for
   */
  loadTiles(datasetID) {
    if (datasetID !== 'fbRoads') return;

    const zoom = this.context.viewport.transform.zoom;
    if (zoom < MIN_ROAD_ZOOM) return;

    const pmtilesService = this.context.services.pmtiles;
    pmtilesService.loadTiles(ML_ROADS_PMTILES_URL);
  }


  /**
   * getData
   * Get already loaded data that appears in the current map view
   * @param   {string}  datasetID - dataset to get data for
   * @return  {Array}   Array of OSM way entities that pass conflation filters
   */
  getData(datasetID) {
    // Intro graph: return entities from the pre-allocated tree
    if (datasetID === 'rapid_intro_graph') {
      const ds = this._introDataset;
      if (!ds || !ds.tree || !ds.graph) return [];
      const extent = this.context.viewport.visibleExtent();
      return ds.tree.intersects(extent, ds.graph);
    }

    if (datasetID !== 'fbRoads') return [];

    const zoom = this.context.viewport.transform.zoom;
    if (zoom < MIN_ROAD_ZOOM) return [];

    const pmtilesService = this.context.services.pmtiles;
    const geojsonFeatures = pmtilesService.getData(ML_ROADS_PMTILES_URL);
    return this._conflateRoads(geojsonFeatures, datasetID);
  }


  /**
   * graph
   * Return the graph for a given dataset (needed for accept feature)
   * @param   {string}  datasetID
   * @return  {Graph}   The graph for this dataset, or null if not applicable
   */
  graph(datasetID) {
    if (datasetID === 'rapid_intro_graph') {
      return this._introDataset?.graph ?? null;
    }
    if (datasetID === 'fbRoads') {
      return this._mlRoadsGraph;
    }
    return null;
  }


  /**
   * merge
   * Merge entities into a dataset graph (used for rapid_intro_graph tutorial injection)
   * @param   {string}  datasetID - Which dataset to merge into
   * @param   {Array}   entities  - OSM entities to merge
   */
  merge(datasetID, entities) {
    if (datasetID === 'rapid_intro_graph') {
      const ds = this._introDataset;
      if (!ds || !ds.tree || !ds.graph) return;
      ds.graph.rebase(entities, [ds.graph], false);
      ds.tree.rebase(entities, false);
    }
  }


  /**
   * _conflateRoads
   * Filter out ML road features that overlap with existing OSM highways,
   * and convert remaining features to OSM entities.
   * Uses mode-aware point-sampling via PMTilesService helpers.
   *
   * @param   {Array}   geojsonFeatures - GeoJSON features from PMTilesService/VectorTileService
   * @param   {string}  datasetID - Which dataset we're processing
   * @return  {Array}   OSM way entities that pass all filters
   */
  _conflateRoads(geojsonFeatures, datasetID) {
    if (!geojsonFeatures || !geojsonFeatures.length) return [];

    // Ensure graph/tree/cache exist
    if (!this._mlRoadsGraph) {
      this._mlRoadsGraph = new Graph();
      this._mlRoadsTree = new Tree(this._mlRoadsGraph);
    }
    const roadsGraph = this._mlRoadsGraph;
    const roadsTree = this._mlRoadsTree;
    const roadsCache = this._mlRoadsCache;

    const pmtilesService = this.context.services.pmtiles;
    const viewport = this.context.viewport;
    const extent = viewport.visibleExtent();

    const { motorized, nonMotorized } = pmtilesService.getOSMHighwaysByMode(extent);

    // Also get already-processed ML roads from the internal tree (from previous render passes)
    // to deduplicate overlapping features from the same dataset (self-conflation)
    const existingMLRoads = pmtilesService.getInternalRoadsByMode(extent, roadsGraph, roadsTree);
    const combinedMotorized = motorized.concat(existingMLRoads.motorized);
    const combinedNonMotorized = nonMotorized.concat(existingMLRoads.nonMotorized);

    const newEntities = [];
    let processedCount = 0;

    for (const feature of geojsonFeatures) {
      if (processedCount >= MAX_FEATURES_PER_FRAME) break;

      const geojson = feature.geojson;
      if (!geojson?.geometry) continue;

      const geomType = geojson.geometry.type;
      if (geomType !== 'LineString' && geomType !== 'MultiLineString') continue;

      const featureID = feature.id || geojson.id;
      if (roadsCache.seen.has(featureID)) continue;
      roadsCache.seen.add(featureID);
      processedCount++;

      // Get line coordinates (handle both LineString and MultiLineString)
      const lineStrings = geomType === 'LineString'
        ? [geojson.geometry.coordinates]
        : geojson.geometry.coordinates;

      // Determine travel mode from properties
      // Tags may be nested inside a `way_tags` JSON string
      let wayTags = {};
      if (geojson.properties?.way_tags) {
        try { wayTags = JSON.parse(geojson.properties.way_tags); } catch (e) { /* ignore */ }
      }
      const hw = wayTags.highway || geojson.properties?.highway || geojson.properties?.class || '';
      const isNonMotorized = NON_MOTORIZED_CLASSES.has(hw);
      const sameModHighways = isNonMotorized ? combinedNonMotorized : combinedMotorized;

      // Check if any linestring in this feature is conflated with existing OSM or ML roads
      let rejected = false;
      for (const coords of lineStrings) {
        if (rejected) break;
        if (pmtilesService.isConflatedWithOSM(coords, sameModHighways)) {
          rejected = true;
        }
      }

      if (rejected) continue;

      // Build OSM tags for surviving features
      const tags = this._mapMLRoadTags(geojson.properties || {});

      // Adjust highway tag based on connected OSM ways at endpoints
      for (const coords of lineStrings) {
        this._adjustHighwayFromOSM(tags, coords);
      }

      // Convert surviving features to OSM entities
      for (let j = 0; j < lineStrings.length; j++) {
        const partID = lineStrings.length > 1 ? `${featureID}-p${j}` : featureID;
        const entities = pmtilesService.geojsonToOSMLine(lineStrings[j], tags, partID, datasetID, 'mapwithai');
        if (entities) {
          newEntities.push(...entities);

          // Within-batch self-conflation: add accepted road to the combined list
          // so subsequent features in this batch can see it
          const coords = lineStrings[j];
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const c of coords) {
            if (c[0] < minX) minX = c[0];
            if (c[0] > maxX) maxX = c[0];
            if (c[1] < minY) minY = c[1];
            if (c[1] > maxY) maxY = c[1];
          }
          const roadData = {
            coords,
            bbox: { minX: minX - 0.0003, minY: minY - 0.0003, maxX: maxX + 0.0003, maxY: maxY + 0.0003 }
          };
          if (isNonMotorized) {
            combinedNonMotorized.push(roadData);
          } else {
            combinedMotorized.push(roadData);
          }
        }
      }
    }

    // Update the internal graph with new entities
    if (newEntities.length) {
      // Snap new way endpoints to existing graph nodes (cross-batch)
      // and deduplicate endpoints within this batch.
      // This ensures roads from different tiles connect at shared nodes.
      this._snapEndpointsToGraph(newEntities, roadsGraph, roadsTree);

      roadsGraph.rebase(newEntities, [roadsGraph], true);
      roadsTree.rebase(newEntities, true);
    }

    // Return ways from the tree that intersect the visible extent
    return roadsTree.intersects(extent, roadsGraph)
      .filter(entity => entity.type === 'way');
  }


  /**
   * _mapMLRoadTags
   * Map ML road feature properties to OSM tags.
   * The PMTiles archive stores OSM tags inside a `way_tags` JSON string property.
   *
   * @param   {Object}  props - Feature properties from PMTiles
   * @return  {Object}  OSM tags
   */
  _mapMLRoadTags(props) {
    // Parse the nested way_tags JSON if present
    let wayTags = {};
    if (props.way_tags) {
      try {
        wayTags = JSON.parse(props.way_tags);
      } catch (e) {
        // ignore malformed JSON
      }
    }

    const tags = {};

    tags.highway = wayTags.highway || 'road';

    if (wayTags.surface) {
      tags.surface = wayTags.surface;
    }

    if (wayTags.source) {
      tags.source = (wayTags.source === 'digitalglobe') ? 'maxar' : wayTags.source;
    }

    return tags;
  }


  /**
   * _adjustHighwayFromOSM
   * If an ML road's endpoint connects to an existing OSM way, compare highway tags
   * and adjust the ML tag to match the connected OSM way when appropriate.
   * For example: ML `residential` connecting to OSM `service` → downgrade to `service`.
   *
   * @param  {Object}  tags   - mutable OSM tags (modified in-place)
   * @param  {Array}   coords - [[lon,lat], ...] coordinates of the ML road
   */
  _adjustHighwayFromOSM(tags, coords) {
    if (!coords || coords.length < 2) return;

    const editor = this.context.systems.editor;
    if (!editor) return;
    const osmGraph = editor.staging.graph;

    const SNAP_TOL = 5e-5;  // ~5.5m
    const endpoints = [coords[0], coords[coords.length - 1]];

    for (const pt of endpoints) {
      const nearby = editor.intersects(new Extent(
        [pt[0] - SNAP_TOL, pt[1] - SNAP_TOL],
        [pt[0] + SNAP_TOL, pt[1] + SNAP_TOL]
      ));

      for (const entity of nearby) {
        if (entity.type !== 'way' || !entity.tags?.highway) continue;
        const osmHw = entity.tags.highway;

        // Check if any node on this OSM way is close to our endpoint
        try {
          const nodes = entity.nodes.map(nid => osmGraph.entity(nid));
          const connected = nodes.some(n =>
            Math.abs(n.loc[0] - pt[0]) < SNAP_TOL && Math.abs(n.loc[1] - pt[1]) < SNAP_TOL
          );
          if (!connected) continue;
        } catch (e) {
          continue;
        }

        // Apply highway tag adjustments based on connected OSM way
        if (tags.highway === 'residential' && osmHw === 'service') {
          tags.highway = 'service';
        }

        return;  // adjusted from first connected way — done
      }
    }
  }


  /**
   * _snapEndpointsToGraph
   * Before rebasing new entities into the graph, check each new way's endpoint
   * nodes against existing nodes already in the graph (from previous tile loads)
   * and against other new ways in the same batch.  If a matching node is found
   * at the same location, swap the way's reference to use the existing node ID
   * and drop the duplicate.
   *
   * This ensures roads from adjacent tiles connect at exactly 1 shared node,
   * regardless of whether they have the same or different tags.
   *
   * Only modifies the `newEntities` array — never touches the existing graph.
   *
   * @param  {Array}   newEntities  - Array of osmNode/osmWay entities (modified in-place)
   * @param  {Object}  graph        - The existing internal Graph
   * @param  {Object}  tree         - The existing internal Tree (RBush)
   */
  _snapEndpointsToGraph(newEntities, graph, tree) {
    const SNAP_TOL = 5e-5;  // ~5.5m

    // Separate new nodes and ways
    const newNodes = new Map();   // Map(nodeID → node)
    const newWays = [];
    for (const e of newEntities) {
      if (e.type === 'node') newNodes.set(e.id, e);
      else if (e.type === 'way') newWays.push(e);
    }

    if (!newWays.length) return;

    // Build a spatial lookup of existing graph node endpoint locations.
    const existingEndpointLocs = [];  // Array of [lon, lat]
    try {
      const extent = this.context.viewport.visibleExtent();
      const existingEntities = tree.intersects(extent, graph);
      for (const entity of existingEntities) {
        if (entity.type !== 'way' || !entity.nodes || entity.nodes.length < 2) continue;
        const firstID = entity.nodes[0];
        const lastID = entity.nodes[entity.nodes.length - 1];
        try {
          existingEndpointLocs.push(graph.entity(firstID).loc);
          existingEndpointLocs.push(graph.entity(lastID).loc);
        } catch (e) { /* skip */ }
      }
    } catch (e) { /* tree may be empty */ }

    // Phase 1: Snap new endpoint node COORDINATES to match existing graph nodes.
    // Don't share node IDs across graphs — just place them at the exact same spot.
    for (const way of newWays) {
      const nodeIDs = way.nodes;
      if (!nodeIDs || nodeIDs.length < 2) continue;

      const endpointIDs = [nodeIDs[0], nodeIDs[nodeIDs.length - 1]];
      for (const nodeID of endpointIDs) {
        const node = newNodes.get(nodeID);
        if (!node) continue;

        for (const existLoc of existingEndpointLocs) {
          if (Math.abs(node.loc[0] - existLoc[0]) < SNAP_TOL &&
              Math.abs(node.loc[1] - existLoc[1]) < SNAP_TOL) {
            node.loc = existLoc.slice();  // snap to exact same coordinates
            break;
          }
        }
      }
    }

    // Phase 2: Within-batch dedup — if two NEW ways share an endpoint location,
    // make them reference the same new node ID (safe because both are new).
    const batchEndpoints = new Map();  // Map(locKey → nodeID) for within-batch dedup
    const remapNode = new Map();
    const removeNodeIDs = new Set();

    for (const way of newWays) {
      const nodeIDs = way.nodes;
      if (!nodeIDs || nodeIDs.length < 2) continue;

      const endpointIDs = [nodeIDs[0], nodeIDs[nodeIDs.length - 1]];
      for (const nodeID of endpointIDs) {
        if (remapNode.has(nodeID)) continue;
        const node = newNodes.get(nodeID);
        if (!node) continue;

        // Quantize location to snap tolerance for lookup key
        const key = `${Math.round(node.loc[0] / SNAP_TOL)},${Math.round(node.loc[1] / SNAP_TOL)}`;
        const existing = batchEndpoints.get(key);

        if (existing && existing !== nodeID) {
          remapNode.set(nodeID, existing);
          removeNodeIDs.add(nodeID);
        } else {
          batchEndpoints.set(key, nodeID);
        }
      }
    }

    if (!remapNode.size) return;

    // Rewrite way node references for within-batch dedup
    for (const way of newWays) {
      let changed = false;
      const updatedNodes = way.nodes.map(nid => {
        const replacement = remapNode.get(nid);
        if (replacement) { changed = true; return replacement; }
        return nid;
      });
      if (changed) way.nodes = updatedNodes;
    }

    // Remove duplicate nodes from the entities array
    for (let i = newEntities.length - 1; i >= 0; i--) {
      if (removeNodeIDs.has(newEntities[i].id)) {
        newEntities.splice(i, 1);
      }
    }
  }

}
