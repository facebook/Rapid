import * as Polyclip from 'polyclip-ts';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { Graph, Tree, RapidDataset } from '../core/lib/index.js';
import { osmEntity, osmNode, osmWay } from '../osm/index.js';
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


// Minimum zoom level for loading building data (prevents slowdown at low zooms)
const MIN_BUILDING_ZOOM = 17;


/**
 * `OvertureService`
 * This service connects to the 'official' sources of Overture PMTiles
 * by acting as a wrapper around the vector tile service
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

      // 3. Fetch only the themes we need (buildings, places)
      const WANTED_THEMES = new Set(['buildings', 'places']);
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

    const vtService = this.context.services.vectortile;
    return this._initPromise = vtService.initAsync()
      .then(() => this._loadStacCatalogAsync());
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    this._started = true;

    const vtService = this.context.services.vectortile;
    return vtService.startAsync();
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

    return [places, esriBuildings, mlBuildings];
  }


  /**
   * loadTiles
   * Use the vector tile service to schedule any data requests needed to cover the current map view
   * @param   {string}  datasetID - dataset to load tiles for
   */
  loadTiles(datasetID) {
    const vtService = this.context.services.vectortile;

    if (datasetID === 'overture-places') {
      const url = this._pmtilesUrls.get('places');
      if (url) vtService.loadTiles(url);
    } else if (datasetID.includes('buildings')) {
      const zoom = this.context.viewport.transform.zoom;
      if (zoom < MIN_BUILDING_ZOOM) return;

      const url = this._pmtilesUrls.get('buildings');
      if (url) vtService.loadTiles(url);
    }
  }


  /**
   * getData
   * Get already loaded data that appears in the current map view
   * @param   {string}  datasetID - dataset to get data for
   * @return  {Array}   Array of data (GeoJSON features for places, OSM entities for buildings)
   */
  getData(datasetID) {
    const vtService = this.context.services.vectortile;

    if (datasetID === 'overture-places') {
      const url = this._pmtilesUrls.get('places');
      return url ? vtService.getData(url) : [];
    } else if (datasetID === 'esri-buildings') {
      const zoom = this.context.viewport.transform.zoom;
      if (zoom < MIN_BUILDING_ZOOM) return [];

      const url = this._pmtilesUrls.get('buildings');
      if (!url) return [];
      const geojsonFeatures = vtService.getData(url);
      return this._conflateBuildings(geojsonFeatures, datasetID, ESRI_SOURCES);
    } else if (datasetID === 'ml-buildings-overture') {
      const zoom = this.context.viewport.transform.zoom;
      if (zoom < MIN_BUILDING_ZOOM) return [];

      const url = this._pmtilesUrls.get('buildings');
      if (!url) return [];
      const geojsonFeatures = vtService.getData(url);
      return this._conflateBuildings(geojsonFeatures, datasetID, ML_SOURCES);
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
    const MAX_FEATURES_PER_FRAME = 500;
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

      // Convert GeoJSON to OSM entities
      const entities = this._geojsonToOSM(geojson, featureID, datasetID, geometrySource);
      if (entities) {
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
   * _geojsonToOSM
   * Convert a GeoJSON Polygon feature to osmNode/osmWay entities
   * @param   {Object}  geojson - GeoJSON Feature with Polygon geometry
   * @param   {string}  featureID - Unique identifier for this feature
   * @param   {string}  datasetID - The dataset this feature belongs to
   * @param   {string}  geometrySource - The @geometry_source value from the feature
   * @return  {Array}   Array of [osmNodes..., osmWay], or null if invalid
   */
  _geojsonToOSM(geojson, featureID, datasetID, geometrySource) {
    if (!geojson?.geometry?.coordinates) return null;

    const coords = geojson.geometry.coordinates[0];  // outer ring only
    if (!coords || coords.length < 4) return null;  // Need at least 3 unique points + closing

    const entities = [];
    const nodeIDs = [];

    // Create nodes for each coordinate (except closing point which duplicates first)
    for (let i = 0; i < coords.length - 1; i++) {
      const loc = coords[i];
      const nodeID = osmEntity.id('node');  // Generate new negative ID

      const node = new osmNode({
        id: nodeID,
        loc: loc,
        tags: {}
      });

      // Add metadata for the Rapid system
      node.__fbid__ = `${datasetID}-${featureID}-n${i}`;
      node.__service__ = 'overture';
      node.__datasetid__ = datasetID;

      entities.push(node);
      nodeIDs.push(nodeID);
    }

    // Close the way by referencing the first node
    nodeIDs.push(nodeIDs[0]);

    // Build tags for the way
    const tags = { building: 'yes' };

    // Add source tag based on geometry source
    if (geometrySource === 'Microsoft ML Buildings') {
      tags.source = 'microsoft/BuildingFootprints';
    } else if (geometrySource === 'Google Open Buildings') {
      tags.source = 'google/OpenBuildings';
    } else if (geometrySource === 'Esri Community Maps') {
      tags.source = 'esri/CommunityMaps';
    }

    // // Add height attributes if present in Overture data
    // const props = geojson.properties || {};
    // if (props.height !== undefined && props.height !== null) {
    //   // Round to nearest 0.5
    //   const roundedHeight = Math.round(props.height * 2) / 2;
    //   tags.height = String(roundedHeight);
    // }
    // if (props.num_floors !== undefined && props.num_floors !== null) {
    //   tags['building:levels'] = String(props.num_floors);
    // }

    // Create the way with appropriate tags
    const wayID = osmEntity.id('way');
    const way = new osmWay({
      id: wayID,
      nodes: nodeIDs,
      tags: tags
    });

    // Add metadata
    way.__fbid__ = `${datasetID}-${featureID}`;
    way.__service__ = 'overture';
    way.__datasetid__ = datasetID;
    way.__gersid__ = (geojson.properties || {}).id || null;  // Store the GERS ID from Overture properties

    entities.push(way);

    return entities;
  }

}
