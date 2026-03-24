import { geoSphericalDistance, vecProject } from '@rapid-sdk/math';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { osmEntity, osmNode, osmWay } from '../osm/index.js';


// Highway classes grouped by travel mode (used for conflation)
const MOTORIZED_HIGHWAYS = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link',
  'primary', 'primary_link', 'secondary', 'secondary_link',
  'tertiary', 'tertiary_link', 'residential', 'unclassified',
  'service', 'road', 'living_street', 'track'
]);
const NON_MOTORIZED_HIGHWAYS = new Set([
  'footway', 'cycleway', 'path', 'pedestrian', 'bridleway', 'steps', 'corridor'
]);

// Overture class values that map to non-motorized highways
const NON_MOTORIZED_CLASSES = new Set([
  'footway', 'cycleway', 'path', 'pedestrian', 'bridleway', 'steps', 'corridor'
]);

// Maximum features to process per render frame (prevents main thread blocking)
const MAX_FEATURES_PER_FRAME = 500;

// Bbox padding in degrees for proximity matching (~30m, enlarged to account for longitude compression at high latitudes)
const BBOX_PAD_DEG = 0.0003;

// Conflation parameters for transportation
const CONFLATION_THRESHOLD_METERS = 5;    // distance within which a sample point is "near" an OSM highway
const CONFLATION_REJECT_RATIO = 0.2;      // fraction of near sample points to reject a feature
const CONFLATION_MAX_SAMPLES = 20;        // maximum sample points along a LineString
const CONFLATION_MIN_SPACING_METERS = 5;  // minimum spacing between sample points


/**
 * `PMTilesService`
 * Generic service that wraps the VectorTileService for PMTiles access
 * and provides shared utilities for road conflation and GeoJSON→OSM conversion.
 *
 * This service acts as a shared layer between domain-specific services
 * (OvertureService, MapWithAIService) and the VectorTileService. It is stateless —
 * consuming services own their own Graph/Tree/Cache state.
 *
 * - Protomaps .pmtiles single-file archive containing MVT
 *    https://protomaps.com/docs/pmtiles
 *    https://github.com/protomaps/PMTiles
 */
export class PMTilesService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'pmtiles';
    this.autoStart = false;
    this._initPromise = null;
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    if (this._initPromise) return this._initPromise;

    const vtService = this.context.services.vectortile;
    return this._initPromise = vtService.initAsync();
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
   * Called after completing an edit session to reset any internal state.
   * This service is stateless — consuming services own their state.
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    return Promise.resolve();
  }


  /**
   * loadTiles
   * Delegate tile loading to VectorTileService for a given PMTiles URL
   * @param  {string}  url - PMTiles archive URL
   */
  loadTiles(url) {
    const vtService = this.context.services.vectortile;
    vtService.loadTiles(url);
  }


  /**
   * getData
   * Delegate data retrieval to VectorTileService for a given PMTiles URL
   * @param   {string}  url - PMTiles archive URL
   * @return  {Array}   Array of features (GeoJSON) in the current viewport
   */
  getData(url) {
    const vtService = this.context.services.vectortile;
    return vtService.getData(url);
  }


  /**
   * getOSMHighwaysByMode
   * Collect existing OSM highway ways in the given extent, categorized by travel mode.
   * Each highway entry includes its coordinates and a padded bounding box for fast filtering.
   *
   * @param   {Object}  extent - Visible extent from the viewport
   * @return  {Object}  `{ motorized, nonMotorized }` arrays of `{ coords, bbox }` objects
   */
  getOSMHighwaysByMode(extent) {
    const editor = this.context.systems.editor;
    const osmGraph = editor.staging.graph;
    const osmEntities = editor.intersects(extent);
    const motorized = [];
    const nonMotorized = [];

    for (const entity of osmEntities) {
      if (entity.type !== 'way' || !entity.tags.highway) continue;
      const hw = entity.tags.highway;
      try {
        const nodes = entity.nodes.map(nodeID => osmGraph.entity(nodeID));
        const coords = nodes.map(n => n.loc);
        if (coords.length < 2) continue;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const c of coords) {
          if (c[0] < minX) minX = c[0];
          if (c[0] > maxX) maxX = c[0];
          if (c[1] < minY) minY = c[1];
          if (c[1] > maxY) maxY = c[1];
        }
        const data = {
          coords,
          bbox: {
            minX: minX - BBOX_PAD_DEG,
            minY: minY - BBOX_PAD_DEG,
            maxX: maxX + BBOX_PAD_DEG,
            maxY: maxY + BBOX_PAD_DEG
          }
        };

        if (MOTORIZED_HIGHWAYS.has(hw)) {
          motorized.push(data);
        } else if (NON_MOTORIZED_HIGHWAYS.has(hw)) {
          nonMotorized.push(data);
        }
      } catch (e) {
        continue;
      }
    }

    return { motorized, nonMotorized };
  }


  /**
   * getInternalRoadsByMode
   * Collect road ways from a caller-provided internal graph/tree (e.g. already-processed
   * ML roads or TomTom roads), categorized by travel mode. Same format as getOSMHighwaysByMode
   * but queries an internal dataset graph instead of the OSM editor graph.
   *
   * @param   {Object}  extent - Visible extent from the viewport
   * @param   {Object}  graph - Internal Graph containing the road entities
   * @param   {Object}  tree - Internal Tree (RBush spatial index) for the road entities
   * @return  {Object}  `{ motorized, nonMotorized }` arrays of `{ coords, bbox }` objects
   */
  getInternalRoadsByMode(extent, graph, tree) {
    const motorized = [];
    const nonMotorized = [];

    if (!graph || !tree) return { motorized, nonMotorized };

    const ways = tree.intersects(extent, graph)
      .filter(entity => entity.type === 'way');

    for (const way of ways) {
      const hw = way.tags?.highway;
      if (!hw) continue;
      try {
        const coords = way.nodes.map(nodeID => graph.entity(nodeID).loc);
        if (coords.length < 2) continue;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const c of coords) {
          if (c[0] < minX) minX = c[0];
          if (c[0] > maxX) maxX = c[0];
          if (c[1] < minY) minY = c[1];
          if (c[1] > maxY) maxY = c[1];
        }
        const data = {
          coords,
          bbox: {
            minX: minX - BBOX_PAD_DEG,
            minY: minY - BBOX_PAD_DEG,
            maxX: maxX + BBOX_PAD_DEG,
            maxY: maxY + BBOX_PAD_DEG
          }
        };

        if (MOTORIZED_HIGHWAYS.has(hw)) {
          motorized.push(data);
        } else if (NON_MOTORIZED_HIGHWAYS.has(hw)) {
          nonMotorized.push(data);
        } else {
          motorized.push(data);  // default to motorized for unknown highway types
        }
      } catch (e) {
        continue;
      }
    }

    return { motorized, nonMotorized };
  }


  /**
   * isConflatedWithOSM
   * Determine whether a LineString is already represented by existing OSM highways.
   * Uses point-sampling: if >20% of interior sample points along the line are within 5m of
   * a same-mode OSM highway, the feature is considered conflated.
   *
   * @param   {Array}   coords - Array of [lon, lat] coordinates for the LineString
   * @param   {Array}   sameModHighways - Array of `{ coords, bbox }` for same-mode OSM highways
   * @return  {boolean} true if the line is conflated (should be rejected)
   */
  isConflatedWithOSM(coords, sameModHighways) {
    if (!coords || coords.length < 2) return false;

    const samplePoints = this.sampleLinePoints(coords, CONFLATION_MAX_SAMPLES, CONFLATION_MIN_SPACING_METERS);
    if (!samplePoints.length) return false;

    // Exclude first and last sample points (endpoints) from the near count.
    // Diverging roads naturally share proximity at their junction, so counting
    // endpoints would cause false positives for roads that split off at an angle.
    const startIdx = samplePoints.length > 2 ? 1 : 0;
    const endIdx = samplePoints.length > 2 ? samplePoints.length - 1 : samplePoints.length;
    const interiorCount = endIdx - startIdx;
    if (interiorCount <= 0) return false;

    let nearCount = 0;

    for (let i = startIdx; i < endIdx; i++) {
      const pt = samplePoints[i];
      let minDist = Infinity;
      for (const highway of sameModHighways) {
        if (pt[0] < highway.bbox.minX || pt[0] > highway.bbox.maxX ||
            pt[1] < highway.bbox.minY || pt[1] > highway.bbox.maxY) {
          continue;
        }
        const dist = this.distToPolylineMeters(pt, highway.coords);
        if (dist < minDist) minDist = dist;
        if (minDist < CONFLATION_THRESHOLD_METERS) break;  // early exit
      }
      if (minDist < CONFLATION_THRESHOLD_METERS) nearCount++;
    }

    return nearCount / interiorCount > CONFLATION_REJECT_RATIO;
  }


  /**
   * sampleLinePoints
   * Generate sample points along a LineString at regular intervals.
   * @param   {Array}   coords - Array of [lon, lat] coordinates
   * @param   {number}  maxSamples - Maximum number of sample points
   * @param   {number}  minSpacingMeters - Minimum spacing between samples in meters
   * @return  {Array}   Array of [lon, lat] sample points
   */
  sampleLinePoints(coords, maxSamples, minSpacingMeters) {
    if (!coords || coords.length < 2) return [];

    let totalLength = 0;
    for (let i = 1; i < coords.length; i++) {
      totalLength += geoSphericalDistance(coords[i - 1], coords[i]);
    }

    if (totalLength === 0) return [coords[0]];

    const maxBySpacing = Math.floor(totalLength / minSpacingMeters) + 1;
    const numSamples = Math.min(maxSamples, maxBySpacing);
    if (numSamples <= 1) return [coords[0]];

    const spacing = totalLength / (numSamples - 1);
    const samples = [];
    let accumulated = 0;
    let nextSampleDist = 0;

    samples.push(coords[0]);
    nextSampleDist = spacing;

    for (let i = 1; i < coords.length && samples.length < numSamples; i++) {
      const segLen = geoSphericalDistance(coords[i - 1], coords[i]);
      const prevAccum = accumulated;
      accumulated += segLen;

      while (nextSampleDist <= accumulated && samples.length < numSamples) {
        const t = (segLen > 0) ? (nextSampleDist - prevAccum) / segLen : 0;
        const lon = coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]);
        const lat = coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1]);
        samples.push([lon, lat]);
        nextSampleDist += spacing;
      }
    }

    return samples;
  }


  /**
   * distToPolylineMeters
   * Compute the minimum distance in meters from a point to any segment of a polyline.
   * Uses vecProject for segment projection, then geoSphericalDistance for the metric.
   *
   * @param   {Array}   pt - [lon, lat] point
   * @param   {Array}   coords - Array of [lon, lat] polyline vertices
   * @return  {number}  Minimum distance in meters
   */
  distToPolylineMeters(pt, coords) {
    if (!coords || coords.length === 0) return Infinity;
    if (coords.length === 1) return geoSphericalDistance(pt, coords[0]);

    const edge = vecProject(pt, coords);
    if (!edge) return Infinity;
    return geoSphericalDistance(pt, edge.target);
  }


  /**
   * geojsonToOSMLine
   * Convert a LineString's coordinates to osmNode/osmWay entities.
   * The returned array is [...osmNodes, osmWay] — the way is always the last element.
   *
   * @param   {Array}   coords - Array of [lon, lat] coordinates
   * @param   {Object}  tags - Pre-built OSM tags for the way
   * @param   {string}  featureID - Unique identifier for this feature
   * @param   {string}  datasetID - The dataset this feature belongs to
   * @param   {string}  serviceName - The service name for __service__ metadata (e.g. 'overture', 'mapwithai')
   * @return  {Array}   Array of [osmNodes..., osmWay], or null if invalid
   */
  geojsonToOSMLine(coords, tags, featureID, datasetID, serviceName) {
    if (!coords || coords.length < 2) return null;

    const entities = [];
    const nodeIDs = [];

    for (let i = 0; i < coords.length; i++) {
      const loc = coords[i];
      const nodeID = osmEntity.id('node');

      const node = new osmNode({
        id: nodeID,
        loc: loc,
        tags: {}
      });

      node.__fbid__ = `${datasetID}-${featureID}-n${i}`;
      node.__service__ = serviceName;
      node.__datasetid__ = datasetID;

      entities.push(node);
      nodeIDs.push(nodeID);
    }

    const wayID = osmEntity.id('way');
    const way = new osmWay({
      id: wayID,
      nodes: nodeIDs,
      tags: tags
    });

    way.__fbid__ = `${datasetID}-${featureID}`;
    way.__service__ = serviceName;
    way.__datasetid__ = datasetID;

    entities.push(way);
    return entities;
  }


  /**
   * geojsonToOSMPolygon
   * Convert a GeoJSON Polygon feature to osmNode/osmWay entities (closed way).
   * The returned array is [...osmNodes, osmWay] — the way is always the last element.
   *
   * @param   {Object}  geojson - GeoJSON Feature with Polygon geometry
   * @param   {Object}  tags - Pre-built OSM tags for the way
   * @param   {string}  featureID - Unique identifier for this feature
   * @param   {string}  datasetID - The dataset this feature belongs to
   * @param   {string}  serviceName - The service name for __service__ metadata (e.g. 'overture', 'mapwithai')
   * @return  {Array}   Array of [osmNodes..., osmWay], or null if invalid
   */
  geojsonToOSMPolygon(geojson, tags, featureID, datasetID, serviceName) {
    if (!geojson?.geometry?.coordinates) return null;

    const coords = geojson.geometry.coordinates[0];  // outer ring only
    if (!coords || coords.length < 4) return null;   // Need at least 3 unique points + closing

    const entities = [];
    const nodeIDs = [];

    // Create nodes for each coordinate (except closing point which duplicates first)
    for (let i = 0; i < coords.length - 1; i++) {
      const loc = coords[i];
      const nodeID = osmEntity.id('node');

      const node = new osmNode({
        id: nodeID,
        loc: loc,
        tags: {}
      });

      node.__fbid__ = `${datasetID}-${featureID}-n${i}`;
      node.__service__ = serviceName;
      node.__datasetid__ = datasetID;

      entities.push(node);
      nodeIDs.push(nodeID);
    }

    // Close the way by referencing the first node
    nodeIDs.push(nodeIDs[0]);

    const wayID = osmEntity.id('way');
    const way = new osmWay({
      id: wayID,
      nodes: nodeIDs,
      tags: tags
    });

    way.__fbid__ = `${datasetID}-${featureID}`;
    way.__service__ = serviceName;
    way.__datasetid__ = datasetID;

    entities.push(way);
    return entities;
  }

}
