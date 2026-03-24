import * as Polyclip from 'polyclip-ts';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { Graph, Tree, RapidDataset } from '../core/lib/index.js';
import { utilFetchResponse } from '../util/index.js';

// STAC catalog root — used to discover the latest Overture release and per-theme PMTiles URLs.
// See: https://stac.overturemaps.org/catalog.json
const STAC_CATALOG_URL = 'https://stac.overturemaps.org/catalog.json';

// Geometry source filters for different datasets
// These match the @geometry_source attribute in Overture PMTiles
// TODO: Verify these source strings match actual PMTiles data values
const ESRI_SOURCES = new Set([
  'Esri Community Maps',
  'City of Vancouver'
]);

const ML_SOURCES = new Set([
  'Microsoft ML Buildings',
  'Google Open Buildings',
]);

// Always filter out OpenStreetMap-sourced buildings
const OSM_SOURCES = new Set([
  'OpenStreetMap',
]);

// DEBUG: Track unique @geometry_source values seen in PMTiles data
const DEBUG_SOURCES = true;
const seenSources = new Set();


// Source filter for TomTom-sourced transportation data
const TOMTOM_SOURCES = new Set(['TomTom']);

// Minimum zoom level for loading building data (prevents slowdown at low zooms)
const MIN_BUILDING_ZOOM = 17;

// Minimum zoom level for loading transportation data
const MIN_TRANSPORTATION_ZOOM = 16;

// Overture class values that map to non-motorized highways
const NON_MOTORIZED_CLASSES = new Set([
  'footway', 'cycleway', 'path', 'pedestrian', 'bridleway', 'steps', 'corridor'
]);

// Highway classes eligible for _link suffix
const LINK_HIGHWAY_TYPES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);

// STAC themes to fetch PMTiles URLs for
const WANTED_THEMES = new Set(['buildings', 'places', 'transportation']);

// Maximum features to process per render frame (prevents main thread blocking)
const MAX_FEATURES_PER_FRAME = 500;

// Map Overture road_surface values to OSM surface= tag values
const SURFACE_MAP = {
  'paved': 'paved',
  'unpaved': 'unpaved',
  'gravel': 'gravel',
  'dirt': 'dirt',
  'paving_stones': 'paving_stones',
  'metal': 'metal'
};


/**
 * `OvertureService`
 * This service connects to the 'official' sources of Overture PMTiles
 * by acting as a wrapper around the PMTiles service
 *
 * - Protomaps .pmtiles single-file archive containing MVT
 *    https://protomaps.com/docs/pmtiles
 *    https://github.com/protomaps/PMTiles
 */
export class OvertureService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'overture';
    this._pmtilesUrls = new Map();   // Map<themeName, pmtilesUrl>  e.g. 'buildings' → 'https://…/buildings.pmtiles'
    this._releaseId = '';             // e.g. '2026-01-21.0'
    this._initPromise = null;

    // For buildings conflation - separate state for each dataset
    this._esriBuildingsGraph = null;
    this._esriBuildingsTree = null;
    this._esriBuildingsCache = { seen: new Set() };

    this._mlBuildingsGraph = null;
    this._mlBuildingsTree = null;
    this._mlBuildingsCache = { seen: new Set() };

    // For transportation conflation
    this._tomtomRoadsGraph = null;
    this._tomtomRoadsTree = null;
    this._tomtomRoadsCache = { seen: new Set() };
  }


  /**
   * _loadStacCatalogAsync
   * Walk the Overture STAC catalog to discover the latest release and resolve
   * per-theme PMTiles URLs (buildings, places, etc.).
   *
   * Catalog structure:
   *   root catalog → release catalogs (latest tagged) → theme catalogs → pmtiles links
   *
   * @return {Promise} Promise resolved when the catalog has been loaded
   */
  async _loadStacCatalogAsync() {
    try {
      // 1. Fetch root catalog
      const rootData = await fetch(STAC_CATALOG_URL).then(utilFetchResponse);

      // 2. Find the latest release (link with `latest: true`)
      const childLinks = (rootData.links ?? []).filter(l => l.rel === 'child');
      const latestLink = childLinks.find(l => l.latest === true);
      if (!latestLink) throw new Error('No latest release found in STAC root catalog');

      const releaseUrl = new URL(latestLink.href, STAC_CATALOG_URL).href;
      const releaseData = await fetch(releaseUrl).then(utilFetchResponse);
      this._releaseId = releaseData.id ?? '';

      // 3. Fetch only the themes we need
      const themeLinks = (releaseData.links ?? []).filter(l => l.rel === 'child' && WANTED_THEMES.has(l.title));
      const themeFetches = themeLinks.map(async link => {
        const themeUrl = new URL(link.href, releaseUrl).href;
        const themeData = await fetch(themeUrl).then(utilFetchResponse);
        const pmtilesLink = (themeData.links ?? []).find(l => l.rel === 'pmtiles');
        if (pmtilesLink) {
          const themeName = themeData.id ?? link.title;
          const pmtilesUrl = new URL(pmtilesLink.href, themeUrl).href;
          this._pmtilesUrls.set(themeName, pmtilesUrl);
        }
      });

      await Promise.all(themeFetches);

      console.log(`[OvertureService] Loaded STAC release "${this._releaseId}" with themes: ${[...this._pmtilesUrls.keys()].join(', ')}`);  // eslint-disable-line no-console
    } catch (error) {
      console.error('[OvertureService] Error loading STAC catalog:', error);  // eslint-disable-line no-console
    }
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
      .then(() => this._loadStacCatalogAsync());
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
    // OSM buildings will be detected on the next render pass.
    const editor = this.context.systems.editor;
    editor.on('merge', () => this._invalidateConflationCaches());

    const pmtilesService = this.context.services.pmtiles;
    return pmtilesService.startAsync();
  }


  /**
   * _invalidateConflationCaches
   * Clear all conflation state so that all Overture features get re-conflated
   * against the latest OSM graph on the next render pass.
   * Both the `seen` sets and internal graphs/trees are reset to avoid
   * duplicate entities from re-processing already-rebased features.
   */
  _invalidateConflationCaches() {
    if (this._esriBuildingsCache) {
      this._esriBuildingsCache.seen.clear();
    }
    if (this._mlBuildingsCache) {
      this._mlBuildingsCache.seen.clear();
    }

    // Also clear the internal graphs/trees so stale entities don't persist
    this._esriBuildingsGraph = null;
    this._esriBuildingsTree = null;
    this._mlBuildingsGraph = null;
    this._mlBuildingsTree = null;

    if (this._tomtomRoadsCache) {
      this._tomtomRoadsCache.seen.clear();
    }
    this._tomtomRoadsGraph = null;
    this._tomtomRoadsTree = null;
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    // Reset buildings conflation state for both datasets
    this._esriBuildingsGraph = null;
    this._esriBuildingsTree = null;
    this._esriBuildingsCache = { seen: new Set() };

    this._mlBuildingsGraph = null;
    this._mlBuildingsTree = null;
    this._mlBuildingsCache = { seen: new Set() };

    this._tomtomRoadsGraph = null;
    this._tomtomRoadsTree = null;
    this._tomtomRoadsCache = { seen: new Set() };

    return Promise.resolve();
  }


  /**
   * getAvailableDatasets
   * Called by `RapidSystem` to get the datasets that this service provides.
   * @return {Array<RapidDataset>}  The datasets this service provides
   */
  getAvailableDatasets() {
    const places = new RapidDataset(this.context, {
      id: 'overture-places',
      conflated: false,
      service: 'overture',
      categories: new Set(['overture', 'places', 'featured']),
      color: '#00ffff',
      dataUsed: ['overture', 'Overture Places'],
      itemUrl: 'https://docs.overturemaps.org/guides/places/',
      licenseUrl: 'https://docs.overturemaps.org/attribution/',
      labelStringID: 'rapid_menu.overture.places.label',
      descriptionStringID: 'rapid_menu.overture.places.description'
    });

    const esriBuildings = new RapidDataset(this.context, {
      id: 'esri-buildings',
      conflated: false,  // We do client-side conflation, not server-side
      service: 'overture',
      categories: new Set(['overture', 'esri', 'buildings', 'featured']),
      color: '#00bfff',  // Deep sky blue for Esri community maps
      dataUsed: ['overture', 'Esri Community Maps'],
      itemUrl: 'https://docs.overturemaps.org/guides/buildings/',
      licenseUrl: 'https://docs.overturemaps.org/attribution/#buildings',
      labelStringID: 'rapid_menu.overture.esri_buildings.label',
      descriptionStringID: 'rapid_menu.overture.esri_buildings.description'
    });

    const mlBuildings = new RapidDataset(this.context, {
      id: 'ml-buildings-overture',
      conflated: false,  // We do client-side conflation, not server-side
      service: 'overture',
      categories: new Set(['overture', 'microsoft', 'google', 'buildings', 'featured']),
      color: '#da26d3',  // Rapid magenta
      dataUsed: ['overture', 'Microsoft ML Buildings', 'Google Open Buildings'],
      itemUrl: 'https://docs.overturemaps.org/guides/buildings/',
      licenseUrl: 'https://docs.overturemaps.org/attribution/#buildings',
      labelStringID: 'rapid_menu.overture.ml_buildings.label',
      descriptionStringID: 'rapid_menu.overture.ml_buildings.description'
    });

    const tomtomRoads = new RapidDataset(this.context, {
      id: 'tomtom-roads',
      conflated: false,  // We do client-side conflation
      service: 'overture',
      categories: new Set(['overture', 'tomtom', 'roads', 'featured']),
      color: '#da26d3',  // Rapid magenta
      dataUsed: ['overture', 'TomTom'],
      itemUrl: 'https://docs.overturemaps.org/guides/transportation/',
      licenseUrl: 'https://docs.overturemaps.org/attribution/',
      labelStringID: 'rapid_menu.overture.tomtom_roads.label',
      descriptionStringID: 'rapid_menu.overture.tomtom_roads.description'
    });

    return [mlBuildings, esriBuildings, tomtomRoads, places];
  }


  /**
   * loadTiles
   * Use the vector tile service to schedule any data requests needed to cover the current map view
   * @param   {string}  datasetID - dataset to load tiles for
   */
  loadTiles(datasetID) {
    const pmtilesService = this.context.services.pmtiles;

    if (datasetID === 'overture-places') {
      const url = this._pmtilesUrls.get('places');
      if (url) pmtilesService.loadTiles(url);
    } else if (datasetID.includes('buildings')) {
      const zoom = this.context.viewport.transform.zoom;
      if (zoom < MIN_BUILDING_ZOOM) return;

      const url = this._pmtilesUrls.get('buildings');
      if (url) pmtilesService.loadTiles(url);
    } else if (datasetID === 'tomtom-roads') {
      const zoom = this.context.viewport.transform.zoom;
      if (zoom < MIN_TRANSPORTATION_ZOOM) return;

      const url = this._pmtilesUrls.get('transportation');
      if (url) pmtilesService.loadTiles(url);
    }
  }


  /**
   * getData
   * Get already loaded data that appears in the current map view
   * @param   {string}  datasetID - dataset to get data for
   * @return  {Array}   Array of data (GeoJSON features for places, OSM entities for buildings)
   */
  getData(datasetID) {
    const pmtilesService = this.context.services.pmtiles;

    if (datasetID === 'overture-places') {
      const url = this._pmtilesUrls.get('places');
      return url ? pmtilesService.getData(url) : [];
    } else if (datasetID === 'esri-buildings') {
      const zoom = this.context.viewport.transform.zoom;
      if (zoom < MIN_BUILDING_ZOOM) return [];

      const url = this._pmtilesUrls.get('buildings');
      if (!url) return [];
      const geojsonFeatures = pmtilesService.getData(url);
      return this._conflateBuildings(geojsonFeatures, datasetID, ESRI_SOURCES);
    } else if (datasetID === 'ml-buildings-overture') {
      const zoom = this.context.viewport.transform.zoom;
      if (zoom < MIN_BUILDING_ZOOM) return [];

      const url = this._pmtilesUrls.get('buildings');
      if (!url) return [];
      const geojsonFeatures = pmtilesService.getData(url);
      return this._conflateBuildings(geojsonFeatures, datasetID, ML_SOURCES);
    } else if (datasetID === 'tomtom-roads') {
      const zoom = this.context.viewport.transform.zoom;
      if (zoom < MIN_TRANSPORTATION_ZOOM) return [];

      const url = this._pmtilesUrls.get('transportation');
      if (!url) return [];
      const geojsonFeatures = pmtilesService.getData(url);
      return this._conflateTransportation(geojsonFeatures, datasetID);
    } else {
      return [];
    }
  }


  /**
   * graph
   * Return the graph for a given dataset (needed for accept feature)
   * @param   {string}  datasetID
   * @return  {Graph}   The graph for this dataset, or null if not applicable
   */
  graph(datasetID) {
    if (datasetID === 'esri-buildings') {
      return this._esriBuildingsGraph;
    } else if (datasetID === 'ml-buildings-overture') {
      return this._mlBuildingsGraph;
    } else if (datasetID === 'tomtom-roads') {
      return this._tomtomRoadsGraph;
    }
    return null;
  }


  /**
   * _conflateBuildings
   * Filter out Overture buildings that overlap with existing OSM buildings,
   * filter by geometry source, and convert remaining buildings to OSM entities
   * @param   {Array}   geojsonFeatures - GeoJSON features from VectorTileService
   * @param   {string}  datasetID - Which dataset we're processing
   * @param   {Set}     allowedSources - Set of @geometry_source values to include
   * @return  {Array}   OSM entities (osmNode, osmWay) that pass all filters
   */
  _conflateBuildings(geojsonFeatures, datasetID, allowedSources) {
    if (!geojsonFeatures || !geojsonFeatures.length) return [];

    // Get the appropriate graph/tree/cache for this dataset
    let buildingsGraph, buildingsTree, buildingsCache;

    if (datasetID === 'esri-buildings') {
      if (!this._esriBuildingsGraph) {
        this._esriBuildingsGraph = new Graph();
        this._esriBuildingsTree = new Tree(this._esriBuildingsGraph);
      }
      buildingsGraph = this._esriBuildingsGraph;
      buildingsTree = this._esriBuildingsTree;
      buildingsCache = this._esriBuildingsCache;
    } else if (datasetID === 'ml-buildings-overture') {
      if (!this._mlBuildingsGraph) {
        this._mlBuildingsGraph = new Graph();
        this._mlBuildingsTree = new Tree(this._mlBuildingsGraph);
      }
      buildingsGraph = this._mlBuildingsGraph;
      buildingsTree = this._mlBuildingsTree;
      buildingsCache = this._mlBuildingsCache;
    } else {
      return [];
    }

    const context = this.context;
    const editor = context.systems.editor;
    const osmGraph = editor.staging.graph;
    const viewport = context.viewport;
    const extent = viewport.visibleExtent();

    // Get all OSM buildings in the visible extent
    const osmEntities = editor.intersects(extent);
    const osmBuildings = osmEntities.filter(entity =>
      entity.type === 'way' &&
      entity.tags.building &&
      entity.tags.building !== 'no'
    );

    // Convert OSM buildings to bounding boxes + polygon coords for fast filtering
    // Only compute full polygon coords if we'll need them for intersection
    const osmBuildingData = [];
    for (const way of osmBuildings) {
      try {
        if (!way.isClosed()) continue;  // Skip non-closed ways
        const coords = way.nodes.map(nodeID => {
          const node = osmGraph.entity(nodeID);
          return node.loc;
        });
        if (coords.length >= 4) {  // Valid polygon needs at least 4 points (3 + closing)
          // Compute bounding box for fast pre-filtering
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const coord of coords) {
            if (coord[0] < minX) minX = coord[0];
            if (coord[0] > maxX) maxX = coord[0];
            if (coord[1] < minY) minY = coord[1];
            if (coord[1] > maxY) maxY = coord[1];
          }
          osmBuildingData.push({
            entity: way,
            coords: [coords],  // Polyclip expects [[ring]]
            bbox: { minX, minY, maxX, maxY }
          });
        }
      } catch (e) {
        // Skip if we can't resolve the nodes
        continue;
      }
    }

    const newEntities = [];

    // Limit processing to avoid blocking the main thread
    const pmtilesService = this.context.services.pmtiles;
    let processedCount = 0;

    for (const feature of geojsonFeatures) {
      // Limit how many features we process per call
      if (processedCount >= MAX_FEATURES_PER_FRAME) break;

      // Only process Polygon features
      const geojson = feature.geojson;
      if (!geojson?.geometry || geojson.geometry.type !== 'Polygon') continue;

      const featureID = feature.id || geojson.id;

      // Skip if we've already processed this feature for this dataset
      if (buildingsCache.seen.has(featureID)) continue;
      buildingsCache.seen.add(featureID);
      processedCount++;

      // Filter by @geometry_source
      const geometrySource = geojson.properties?.['@geometry_source'];

      // DEBUG: Log unique @geometry_source values
      if (DEBUG_SOURCES && geometrySource && !seenSources.has(geometrySource)) {
        seenSources.add(geometrySource);
        console.log('[OvertureService] New @geometry_source value found:', geometrySource);  // eslint-disable-line no-console
        console.log('[OvertureService] All sources seen so far:', [...seenSources]);  // eslint-disable-line no-console
      }

      // Always filter out OpenStreetMap-sourced buildings
      if (geometrySource && OSM_SOURCES.has(geometrySource)) continue;

      // Only include buildings from allowed sources
      if (!geometrySource || !allowedSources.has(geometrySource)) continue;

      const overtureCoords = geojson.geometry.coordinates;

      // Compute bounding box for the Overture building for fast pre-filtering
      const outerRing = overtureCoords[0];
      let oMinX = Infinity, oMinY = Infinity, oMaxX = -Infinity, oMaxY = -Infinity;
      for (const coord of outerRing) {
        if (coord[0] < oMinX) oMinX = coord[0];
        if (coord[0] > oMaxX) oMaxX = coord[0];
        if (coord[1] < oMinY) oMinY = coord[1];
        if (coord[1] > oMaxY) oMaxY = coord[1];
      }

      // Check if this Overture building overlaps with ANY OSM building
      let hasOverlap = false;
      for (const osmBuilding of osmBuildingData) {
        // Fast bounding box check first
        const ob = osmBuilding.bbox;
        if (oMaxX < ob.minX || oMinX > ob.maxX || oMaxY < ob.minY || oMinY > ob.maxY) {
          continue;  // Bounding boxes don't overlap, skip expensive intersection
        }

        // Bounding boxes overlap, do full polygon intersection test
        try {
          const intersection = Polyclip.intersection(overtureCoords, osmBuilding.coords);
          if (intersection && intersection.length > 0) {
            hasOverlap = true;
            break;  // Aggressive filtering: any overlap = reject
          }
        } catch (e) {
          // Polyclip can throw on invalid geometries, skip this comparison
          continue;
        }
      }

      if (hasOverlap) continue;  // Filter out overlapping building

      // Convert GeoJSON to OSM entities via shared PMTilesService method
      // Build tags first (Overture-specific)
      const tags = { building: 'yes' };
      if (geometrySource === 'Microsoft ML Buildings') {
        tags.source = 'microsoft/BuildingFootprints';
      } else if (geometrySource === 'Google Open Buildings') {
        tags.source = 'google/OpenBuildings';
      } else if (geometrySource === 'Esri Community Maps') {
        tags.source = 'esri/CommunityMaps';
      }

      const entities = pmtilesService.geojsonToOSMPolygon(geojson, tags, featureID, datasetID, 'overture');
      if (entities) {
        const way = entities.at(-1);  // last entity is always the way
        way.__gersid__ = (geojson.properties || {}).id || null;
        newEntities.push(...entities);
      }
    }

    // Update the internal graph with new entities
    if (newEntities.length) {
      buildingsGraph.rebase(newEntities, [buildingsGraph], true);
      buildingsTree.rebase(newEntities, true);
    }

    // Return entities from the tree that intersect the visible extent
    return buildingsTree.intersects(extent, buildingsGraph)
      .filter(entity => entity.type === 'way');  // Only return ways, not nodes
  }


  /**
   * _conflateTransportation
   * Filter out Overture transportation features that overlap with existing OSM highways,
   * filter by source (TomTom only), and convert remaining features to OSM entities.
   * Uses mode-aware point-sampling via PMTilesService helpers: motorized roads are only
   * conflated against motorized OSM highways, and non-motorized paths against non-motorized ones.
   *
   * @param   {Array}   geojsonFeatures - GeoJSON features from PMTilesService
   * @param   {string}  datasetID - Which dataset we're processing
   * @return  {Array}   OSM way entities that pass all filters
   */
  _conflateTransportation(geojsonFeatures, datasetID) {
    if (!geojsonFeatures || !geojsonFeatures.length) return [];

    // Ensure graph/tree/cache exist
    if (!this._tomtomRoadsGraph) {
      this._tomtomRoadsGraph = new Graph();
      this._tomtomRoadsTree = new Tree(this._tomtomRoadsGraph);
    }
    const roadsGraph = this._tomtomRoadsGraph;
    const roadsTree = this._tomtomRoadsTree;
    const roadsCache = this._tomtomRoadsCache;

    const pmtilesService = this.context.services.pmtiles;
    const viewport = this.context.viewport;
    const extent = viewport.visibleExtent();

    const { motorized, nonMotorized } = pmtilesService.getOSMHighwaysByMode(extent);

    // Also get already-processed TomTom roads from the internal tree (from previous render passes)
    // to deduplicate overlapping features from the same dataset (self-conflation)
    const existingRoads = pmtilesService.getInternalRoadsByMode(extent, roadsGraph, roadsTree);
    const combinedMotorized = motorized.concat(existingRoads.motorized);
    const combinedNonMotorized = nonMotorized.concat(existingRoads.nonMotorized);

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

      // Filter by source — only keep TomTom, reject OSM
      const geometrySource = this._getTransportationSource(geojson.properties);

      if (geometrySource && OSM_SOURCES.has(geometrySource)) continue;
      if (!geometrySource || !TOMTOM_SOURCES.has(geometrySource)) continue;

      // Get line coordinates (handle both LineString and MultiLineString)
      const lineStrings = geomType === 'LineString'
        ? [geojson.geometry.coordinates]
        : geojson.geometry.coordinates;

      // Determine travel mode from Overture class
      const overtureClass = geojson.properties?.class || '';
      const isNonMotorized = NON_MOTORIZED_CLASSES.has(overtureClass);
      const sameModHighways = isNonMotorized ? combinedNonMotorized : combinedMotorized;

      // Check if any linestring in this feature is conflated with existing OSM or TomTom roads
      let rejected = false;
      for (const coords of lineStrings) {
        if (rejected) break;
        if (pmtilesService.isConflatedWithOSM(coords, sameModHighways)) {
          rejected = true;
        }
      }

      if (rejected) continue;

      // Build OSM tags (Overture-specific mapping)
      const tags = this._mapOvertureTransportationTags(geojson.properties || {});

      // Convert surviving features to OSM entities via shared PMTilesService method
      for (let j = 0; j < lineStrings.length; j++) {
        const partID = lineStrings.length > 1 ? `${featureID}-p${j}` : featureID;
        const entities = pmtilesService.geojsonToOSMLine(lineStrings[j], tags, partID, datasetID, 'overture');
        if (entities) {
          const way = entities.at(-1);  // last entity is always the way
          way.__gersid__ = (geojson.properties || {}).id || null;
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
   * _getTransportationSource
   * Extract the primary source dataset name from transportation feature properties.
   * Transportation features use a `sources` array with `dataset` fields,
   * unlike buildings which use `@geometry_source`.
   * The `sources` property may be a JSON string (from MVT encoding) or an array.
   * @param   {Object}  props - Feature properties
   * @return  {string|null}  Source dataset name (e.g. 'TomTom', 'OpenStreetMap'), or null
   */
  _getTransportationSource(props) {
    if (!props) return null;

    // Transportation uses `sources` array with `dataset` field
    let sources = props.sources;
    if (!sources) return null;

    // MVT may encode arrays as JSON strings
    if (typeof sources === 'string') {
      try { sources = JSON.parse(sources); } catch (e) { return null; }
    }

    if (Array.isArray(sources) && sources.length > 0) {
      return sources[0].dataset || null;
    }

    return null;
  }


  /**
   * _mapOvertureTransportationTags
   * Map Overture transportation properties to OSM tags.
   * PMTiles MVT may encode nested properties differently than the raw schema,
   * so this includes fallback handling for flattened property names.
   *
   * @param   {Object}  props - Feature properties from Overture PMTiles
   * @return  {Object}  OSM tags
   */
  _mapOvertureTransportationTags(props) {
    const tags = {};

    // highway= from class
    let highwayClass = props.class || '';
    if (highwayClass === 'unknown') {
      highwayClass = 'road';  // TomTom-sourced unknowns → road (OSM equivalent for unknown classification)
    }

    // Check for _link subclass
    const subclassRules = props.subclass_rules || props.subclass || [];
    let isLink = false;
    let footwayValue = null;
    if (Array.isArray(subclassRules)) {
      for (const rule of subclassRules) {
        const val = rule?.value || rule;
        if (val === 'link') isLink = true;
        if (val === 'sidewalk') footwayValue = 'sidewalk';
        if (val === 'crosswalk') footwayValue = 'crossing';
      }
    } else if (typeof subclassRules === 'string') {
      if (subclassRules === 'link') isLink = true;
      if (subclassRules === 'sidewalk') footwayValue = 'sidewalk';
      if (subclassRules === 'crosswalk') footwayValue = 'crossing';
    }

    if (highwayClass) {
      if (isLink && LINK_HIGHWAY_TYPES.has(highwayClass)) {
        tags.highway = highwayClass + '_link';
      } else {
        tags.highway = highwayClass;
      }
    }

    // footway= from subclass
    if (footwayValue && tags.highway === 'footway') {
      tags.footway = footwayValue;
    }

    // surface= from road_surface
    const roadSurface = props.road_surface || props.surface || [];
    if (Array.isArray(roadSurface) && roadSurface.length > 0) {
      const surfVal = roadSurface[0]?.value || roadSurface[0];
      if (surfVal && SURFACE_MAP[surfVal]) {
        tags.surface = SURFACE_MAP[surfVal];
      }
    } else if (typeof roadSurface === 'string' && SURFACE_MAP[roadSurface]) {
      tags.surface = SURFACE_MAP[roadSurface];
    }

    // source — safe to hardcode because _conflateTransportation filters to TomTom-only
    tags.source = 'TomTom';

    return tags;
  }

}
