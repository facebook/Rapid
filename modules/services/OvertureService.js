import * as Polyclip from 'polyclip-ts';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { Graph, Tree, RapidDataset } from '../core/lib/index.js';
import { osmEntity, osmNode, osmWay } from '../osm/index.js';
import { utilFetchResponse } from '../util/index.js';

const PMTILES_ROOT_URL = 'https://overturemaps-tiles-us-west-2-beta.s3.us-west-2.amazonaws.com/';
const PMTILES_CATALOG_PATH = 'pmtiles_catalog.json';

// Overture Buildings PMTiles URL - the date portion can be updated
const OVERTURE_BUILDINGS_DATE = '2025-11-19';
const OVERTURE_BUILDINGS_URL = `https://d3c1b7bog2u1nn.cloudfront.net/${OVERTURE_BUILDINGS_DATE}/buildings.pmtiles`;


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
    this.pmTilesCatalog = {};

    this.latestRelease = '';
    this._initPromise = null;

    // For buildings conflation
    this._buildingsGraph = null;
    this._buildingsTree = null;
    this._buildingsCache = {
      seen: new Set(),           // Set(featureID) - features we've processed
    };
  }


  /**
   * _loadS3CatalogAsync
   * Load and parse the overture catalog data
   * @return {Promise} Promise resolved when the data has been loaded
   */
  _loadS3CatalogAsync() {
    return fetch(PMTILES_ROOT_URL + PMTILES_CATALOG_PATH)
      .then(utilFetchResponse)
      .then(json => {
        this.pmTilesCatalog = json;

        // Grab the very latest date stamp and keep track of the release associated with it.
        const dateStrings = this.pmTilesCatalog.releases.map(release => release.release_id);
        dateStrings.sort((a, b) => new Date(b) - new Date(a));
        this.latestRelease = this.pmTilesCatalog.releases.find(release => release.release_id === dateStrings[0]);
      })
      .catch(error => {
        console.error('Error fetching or parsing the PMTiles Catalog: ', error);   // eslint-disable-line no-console
      });
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
      .then(() => this._loadS3CatalogAsync());
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
    // Reset buildings conflation state
    this._buildingsGraph = null;
    this._buildingsTree = null;
    this._buildingsCache = {
      seen: new Set(),
    };
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
      licenseUrl: 'https://docs.overturemaps.org/attribution/#places',
      labelStringID: 'rapid_menu.overture.places.label',
      descriptionStringID: 'rapid_menu.overture.places.description'
    });

    const buildings = new RapidDataset(this.context, {
      id: 'overture-buildings',
      conflated: false,  // We do client-side conflation, not server-side
      service: 'overture',
      categories: new Set(['overture', 'buildings', 'featured']),
      color: '#00ffff',
      dataUsed: ['overture', 'Overture Buildings'],
      itemUrl: 'https://docs.overturemaps.org/guides/buildings/',
      licenseUrl: 'https://docs.overturemaps.org/attribution/',
      labelStringID: 'rapid_menu.overture.buildings.label',
      descriptionStringID: 'rapid_menu.overture.buildings.description'
    });

    return [places, buildings];
  }


  /**
   * loadTiles
   * Use the vector tile service to schedule any data requests needed to cover the current map view
   * @param   {string}  datasetID - dataset to load tiles for
   */
  loadTiles(datasetID) {
    const vtService = this.context.services.vectortile;

    if (datasetID.includes('places')) {
      const file = this.latestRelease.files.find(file => file.theme === 'places');
      const url = PMTILES_ROOT_URL + file.href;
      vtService.loadTiles(url);
    } else if (datasetID.includes('buildings')) {
      vtService.loadTiles(OVERTURE_BUILDINGS_URL);
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

    if (datasetID.includes('places')) {
      const file = this.latestRelease.files.find(file => file.theme === 'places');
      const url = PMTILES_ROOT_URL + file.href;
      return vtService.getData(url);
    } else if (datasetID.includes('buildings')) {
      const geojsonFeatures = vtService.getData(OVERTURE_BUILDINGS_URL);
      return this._conflateBuildings(geojsonFeatures);
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
    if (datasetID.includes('buildings')) {
      return this._buildingsGraph;
    }
    return null;  // places don't have a graph currently
  }


  /**
   * _conflateBuildings
   * Filter out Overture buildings that overlap with existing OSM buildings,
   * then convert remaining buildings to OSM entities
   * @param   {Array}  geojsonFeatures - GeoJSON features from VectorTileService
   * @return  {Array}  OSM entities (osmNode, osmWay) that don't overlap with OSM
   */
  _conflateBuildings(geojsonFeatures) {
    if (!geojsonFeatures || !geojsonFeatures.length) return [];

    // Initialize graph/tree if needed
    if (!this._buildingsGraph) {
      this._buildingsGraph = new Graph();
      this._buildingsTree = new Tree(this._buildingsGraph);
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

    // Convert OSM buildings to polygon coordinates for intersection testing
    const osmBuildingPolygons = [];
    for (const way of osmBuildings) {
      try {
        if (!way.isClosed()) continue;  // Skip non-closed ways
        const coords = way.nodes.map(nodeID => {
          const node = osmGraph.entity(nodeID);
          return node.loc;
        });
        if (coords.length >= 4) {  // Valid polygon needs at least 4 points (3 + closing)
          osmBuildingPolygons.push({ entity: way, coords: [coords] });  // Polyclip expects [[ring]]
        }
      } catch (e) {
        // Skip if we can't resolve the nodes
        continue;
      }
    }

    const newEntities = [];

    for (const feature of geojsonFeatures) {
      // Only process Polygon features
      const geojson = feature.geojson;
      if (!geojson?.geometry || geojson.geometry.type !== 'Polygon') continue;

      const featureID = feature.id || geojson.id;

      // Skip if we've already processed this feature
      if (this._buildingsCache.seen.has(featureID)) continue;
      this._buildingsCache.seen.add(featureID);

      const overtureCoords = geojson.geometry.coordinates;

      // Check if this Overture building overlaps with ANY OSM building
      let hasOverlap = false;
      for (const osmBuilding of osmBuildingPolygons) {
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
      const entities = this._geojsonToOSM(geojson, featureID);
      if (entities) {
        newEntities.push(...entities);
      }
    }

    // Update the internal graph with new entities
    if (newEntities.length) {
      this._buildingsGraph.rebase(newEntities, [this._buildingsGraph], true);
      this._buildingsTree.rebase(newEntities, true);
    }

    // Return entities from the tree that intersect the visible extent
    return this._buildingsTree.intersects(extent, this._buildingsGraph)
      .filter(entity => entity.type === 'way');  // Only return ways, not nodes
  }


  /**
   * _geojsonToOSM
   * Convert a GeoJSON Polygon feature to osmNode/osmWay entities
   * @param   {Object}  geojson - GeoJSON Feature with Polygon geometry
   * @param   {string}  featureID - Unique identifier for this feature
   * @return  {Array}   Array of [osmNodes..., osmWay], or null if invalid
   */
  _geojsonToOSM(geojson, featureID) {
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
      node.__fbid__ = `overture-${featureID}-n${i}`;
      node.__service__ = 'overture';
      node.__datasetid__ = 'overture-buildings';

      entities.push(node);
      nodeIDs.push(nodeID);
    }

    // Close the way by referencing the first node
    nodeIDs.push(nodeIDs[0]);

    // Create the way with building=yes tag
    const wayID = osmEntity.id('way');
    const way = new osmWay({
      id: wayID,
      nodes: nodeIDs,
      tags: { building: 'yes' }
    });

    // Add metadata
    way.__fbid__ = `overture-${featureID}`;
    way.__service__ = 'overture';
    way.__datasetid__ = 'overture-buildings';

    entities.push(way);

    return entities;
  }

}
