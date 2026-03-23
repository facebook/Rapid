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
 * `MetaService`
 * This service provides Meta ML road datasets from PMTiles archives.
 * It delegates tile loading and shared conflation/conversion logic to `PMTilesService`,
 * accessed at runtime via `this.context.services.pmtiles`.
 *
 * Currently provides one dataset:
 *   - `ml-roads` — ML-detected road geometries from a global PMTiles archive
 */
export class MetaService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'meta';
    this._initPromise = null;

    this._mlRoadsGraph = null;
    this._mlRoadsTree = null;
    this._mlRoadsCache = { seen: new Set() };
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    if (this._initPromise) return this._initPromise;

    const pmtilesService = this.context.services.pmtiles;
    return this._initPromise = pmtilesService.initAsync();
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

    return Promise.resolve();
  }


  /**
   * getAvailableDatasets
   * Called by `RapidSystem` to get the datasets that this service provides.
   * @return {Array<RapidDataset>}  The datasets this service provides
   */
  getAvailableDatasets() {
    const mlRoads = new RapidDataset(this.context, {
      id: 'ml-roads',
      conflated: false,
      service: 'meta',
      categories: new Set(['meta', 'roads', 'featured']),
      color: '#da26d3',
      dataUsed: ['meta', 'Meta ML Roads'],
      itemUrl: 'https://github.com/facebookmicrosites/Open-Mapping-At-Facebook',
      licenseUrl: 'https://rapideditor.org/doc/license/MapWithAILicense.pdf',
      labelStringID: 'rapid_menu.fbRoads.label',
      descriptionStringID: 'rapid_menu.fbRoads.description'
    });

    return [mlRoads];
  }


  /**
   * loadTiles
   * Use the PMTiles service to schedule any data requests needed to cover the current map view
   * @param   {string}  datasetID - dataset to load tiles for
   */
  loadTiles(datasetID) {
    if (datasetID !== 'ml-roads') return;

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
    if (datasetID !== 'ml-roads') return [];

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
    if (datasetID === 'ml-roads') {
      return this._mlRoadsGraph;
    }
    return null;
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

      // Determine travel mode from properties (future-proofed)
      // Currently all ML roads are assumed motorized since properties are empty
      const featureClass = geojson.properties?.class || '';
      const isNonMotorized = NON_MOTORIZED_CLASSES.has(featureClass);
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

      // Convert surviving features to OSM entities
      for (let j = 0; j < lineStrings.length; j++) {
        const partID = lineStrings.length > 1 ? `${featureID}-p${j}` : featureID;
        const entities = pmtilesService.geojsonToOSMLine(lineStrings[j], tags, partID, datasetID, 'meta');
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
   * Currently the PMTiles archive has empty properties, so this defaults to
   * `highway=road`. The method is structured to handle future attributes
   * (highway, class, surface) when they become available.
   *
   * @param   {Object}  props - Feature properties from PMTiles
   * @return  {Object}  OSM tags
   */
  _mapMLRoadTags(props) {
    const tags = {};

    // highway= from properties (future-proofed for when attributes are added)
    if (props.highway) {
      tags.highway = props.highway;
    } else if (props.class) {
      tags.highway = props.class === 'unknown' ? 'road' : props.class;
    } else {
      tags.highway = 'road';
    }

    // surface= from properties
    if (props.surface) {
      tags.surface = props.surface;
    } else if (props.road_surface) {
      tags.surface = props.road_surface;
    }

    tags.source = 'meta/ml_roads';

    return tags;
  }

}
