import * as PIXI from 'pixi.js';
import geojsonRewind from '@mapbox/geojson-rewind';
import { vecAngle, vecLength, vecInterp } from '@rapid-sdk/math';

import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeatureLine } from './PixiFeatureLine.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';
import { PixiFeaturePolygon } from './PixiFeaturePolygon.js';

const MINZOOM = 12;


/**
 * PixiLayerOsm
 * @class
 */
export class PixiLayerOsm extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);
    this.enabled = true;   // OSM layers should be enabled by default

    const basemapContainer = this.scene.groups.get('basemap');
    this._resolved = new Map();  // Map (entity.id -> GeoJSON feature)

// experiment for benchmarking
//    this._alreadyDownloaded = false;
//    this._saveCannedData = false;

    const areas = new PIXI.Container();
    areas.name = `${this.layerID}-areas`;
    areas.sortableChildren = true;
    this.areaContainer = areas;

    const lines = new PIXI.Container();
    lines.name = `${this.layerID}-lines`;
    lines.sortableChildren = true;
    this.lineContainer = lines;

    basemapContainer.addChild(areas, lines);
  }


  /**
   * supported
   * Whether the Layer's service exists
   */
  get supported() {
    return !!this.context.services.osm;
  }


  /**
   * enabled
   * Whether the user has chosen to see the Layer
   * Make sure to start the service first.
   */
  get enabled() {
    return this._enabled;
  }
  set enabled(val) {
    if (!this.supported) {
      val = false;
    }

    if (val === this._enabled) return;  // no change
    this._enabled = val;

    if (val) {
      this.dirtyLayer();
      this.context.services.osm.startAsync();
    }
  }


// experiment for benchmarking
//  /**
//   * downloadFile
//   * experiment for benchmarking
//   * @param  data
//   * @param  fileName
//   */
//  _downloadFile(data, fileName) {
//    let a = document.createElement('a');   // Create an invisible A element
//    a.style.display = 'none';
//    document.body.appendChild(a);
//
//    // Set the HREF to a Blob representation of the data to be downloaded
//    a.href = window.URL.createObjectURL(new Blob([data]));
//
//    // Use download attribute to set set desired file name
//    a.setAttribute('download', fileName);
//
//    // Trigger the download by simulating click
//    a.click();
//
//    // Cleanup
//    window.URL.revokeObjectURL(a.href);
//    document.body.removeChild(a);
//  }


  /**
   * reset
   * Every Layer should have a reset function to clear out any state when a reset occurs.
   */
  reset() {
    super.reset();
    this._resolved.clear();
  }


  /**
   * render
   * Render any data we have, and schedule fetching more of it to cover the view
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  render(frame, viewport, zoom) {
    const service = this.context.services.osm;
    if (!this.enabled || !service?.started || zoom < MINZOOM) return;

    const context = this.context;
    const editor = context.systems.editor;
    const filters = context.systems.filters;
    const graph = editor.staging.graph;

    context.loadTiles();  // Load tiles of OSM data to cover the view

    let entities = editor.intersects(context.viewport.visibleExtent());   // Gather data in view
    entities = filters.filter(entities, graph);   // Apply feature filters

    const data = {
      polygons: new Map(),
      lines: new Map(),
      points: new Map(),
      vertices: new Map(),
    };

    for (const entity of entities) {
      const geom = entity.geometry(graph);
      if (geom === 'point') {
        data.points.set(entity.id, entity);
      } else if (geom === 'vertex') {
        data.vertices.set(entity.id, entity);
      } else if (geom === 'line') {
        data.lines.set(entity.id, entity);
      } else if (geom === 'area') {
        data.polygons.set(entity.id, entity);
      }
    }

// experiment for benchmarking
//    // Instructions to save 'canned' entity data for use in the renderer test suite:
//    // Set a breakpoint at the next line, then modify `this._saveCannedData` to be 'true'
//    // continuing will fire off the download of the data into a file called 'canned_data.json'.
//    // move the data into the test/spec/renderer directory.
//    if (this._saveCannedData && !this._alreadyDownloaded) {
//      const [lng, lat] = map.center();
//
//      let viewData = {
//        'lng': lng,
//        'lat': lat,
//        'zoom': zoom,
//        'width': window.innerWidth,
//        'height': window.innerHeight,
//        'viewport': viewport,
//        'data': data,
//        'entities': graph.base.entities   // TODO convert from Map to Object if we are keeping this)
//      };
//
//      let cannedData = JSON.stringify(viewData);
//      this._downloadFile(cannedData,`${zoom}_${lat}_${lng}_canned_osm_data.json`);
//      this._alreadyDownloaded = true;
//    }

    this.renderPolygons(frame, viewport, zoom, data);
    this.renderLines(frame, viewport, zoom, data);
    this.renderPoints(frame, viewport, zoom, data);

    // At this point, all the visible linear features have been accounted for,
    // and parent-child data links have been established.

    // Gather ids related for the selected/hovered/drawing features.
    const selectedIDs = this._classHasData.get('selected') ?? new Set();
    const hoveredIDs = this._classHasData.get('hovered') ?? new Set();
    const drawingIDs = this._classHasData.get('drawing') ?? new Set();
    const dataIDs = new Set([...selectedIDs, ...hoveredIDs, ...drawingIDs]);

    // Experiment: avoid showing child vertices/midpoints for too small parents
    for (const dataID of dataIDs) {
      const entity = graph.hasEntity(dataID);
      if (entity?.type === 'node') continue;  // ways, relations only

      const renderedFeatureIDs = this._dataHasFeature.get(dataID) ?? new Set();
      let tooSmall = false;
      for (const featureID of renderedFeatureIDs) {
        const geom = this.features.get(featureID)?.geometry;
        if (!geom || geom.type === 'point') continue;  // lines, polygons only (i.e. ignore virtual poi if any)
        if (geom.width < 25 && geom.height < 25) {
          tooSmall = true;
          break;
        }
      }
      if (tooSmall) {
        dataIDs.delete(dataID);
      }
    }

    // Expand set to include parent ways for selected/hovered/drawing nodes too..
    const interestingIDs = new Set(dataIDs);
    for (const dataID of dataIDs) {
      const entity = graph.hasEntity(dataID);
      if (entity?.type !== 'node') continue;   // nodes only
      for (const parent of graph.parentWays(entity)) {
        interestingIDs.add(parent.id);
      }
    }

    // Create collections of the sibling and descendant IDs,
    // These will determine which vertices and midpoints get drawn.
    const related = {
      descendantIDs: new Set(),
      siblingIDs: new Set()
    };
    for (const interestingID of interestingIDs) {
      this.getSelfAndDescendants(interestingID, related.descendantIDs);
      this.getSelfAndSiblings(interestingID, related.siblingIDs);
    }

    this.renderVertices(frame, viewport, zoom, data, related);

    if (context.mode?.id === 'select-osm') {
      this.renderMidpoints(frame, viewport, zoom, data, related);
    }
  }


  /**
   * renderPolygons
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   * @param  data       Visible OSM data to render, sorted by type
   */
  renderPolygons(frame, viewport, zoom, data) {
    const entities = data.polygons;
    const context = this.context;
    const graph = context.systems.editor.staging.graph;
    const l10n = context.systems.l10n;
    const presets = context.systems.presets;
    const styles = context.systems.styles;

    const pointsContainer = this.scene.groups.get('points');
    const showPoints = context.systems.filters.isEnabled('points');

    // For deciding if an unlabeled polygon feature is interesting enough to show a virtual pin.
    // Note that labeled polygon features will always get a virtual pin.
    function isInterestingPreset(preset) {
      if (!preset || preset.isFallback()) return false;

      // These presets probably are not POIs
      if (/^(address|building|indoor|landuse|man_made|military|natural|playground)/.test(preset.id)) return false;

      // These presets probably are POIs even without a label
      // See nsi.guide for the sort of things we are looking for.
      if (/^(attraction|club|craft|emergency|healthcare|office|power|shop|telecom|tourism)/.test(preset.id)) return true;
      if (/^amenity\/(?!parking|shelter)/.test(preset.id)) return true;
      if (/^leisure\/(?!garden|firepit|picnic_table|pitch|swimming_pool)/.test(preset.id)) return true;

      return false;   // not sure, just ignore it
    }


    for (const [entityID, entity] of entities) {
      const version = entity.v || 0;

      // Cache GeoJSON resolution, as we expect the rewind and asGeoJSON calls to be kinda slow.
      let geojson = this._resolved.get(entityID);
      if (geojson?.v !== version) {  // bust cache if the entity has a new version
        geojson = null;
      }
      if (!geojson) {
        geojson = geojsonRewind(entity.asGeoJSON(graph), true);
        geojson.v = version;
        this._resolved.set(entityID, geojson);
      }

      const parts = (geojson.type === 'Polygon') ? [geojson.coordinates]
        : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];

      for (let i = 0; i < parts.length; ++i) {
        const coords = parts[i];
        const featureID = `${this.layerID}-${entityID}-fill-${i}`;
        let feature = this.features.get(featureID);

        // If feature existed before as a different type, recreate it.
        if (feature && feature.type !== 'polygon') {
          feature.destroy();
          feature = null;
        }

        if (!feature) {
          feature = new PixiFeaturePolygon(this, featureID);
          feature.parentContainer = this.areaContainer;
        }

        // If data has changed.. Replace data and parent-child links.
        if (feature.v !== version) {
          feature.v = version;
          feature.geometry.setCoords(coords);
          const area = feature.geometry.origExtent.area();   // estimate area from extent for speed
          feature.container.zIndex = -area;      // sort by area descending (small things above big things)

          feature.setData(entityID, entity);
          feature.clearChildData(entityID);
          if (entity.type === 'relation') {
            entity.members.forEach(member => feature.addChildData(entityID, member.id));
          }
          if (entity.type === 'way') {
            entity.nodes.forEach(nodeID => feature.addChildData(entityID, nodeID));
          }
        }

        this.syncFeatureClasses(feature);

        if (feature.dirty) {
          const preset = presets.match(entity, graph);

          const style = styles.styleMatch(entity.tags);
          style.labelTint = style.fill.color ?? style.stroke.color ?? 0xeeeeee;
          feature.style = style;

          const label = l10n.displayPOIName(entity.tags);
          feature.label = label;

          // POI = "Point of Interest" -and- "Pole of Inaccessability"
          // For POIs mapped as polygons, we can create a virtual point feature at the pole of inaccessability.
          // Try to show a virtual pin if there is a label or if the preset is interesting enough..
          if (showPoints && (label || isInterestingPreset(preset))) {
            feature.poiFeatureID = `${this.layerID}-${entityID}-poi-${i}`;
            feature.poiPreset = preset;
          } else {
            feature.poiFeatureID = null;
            feature.poiPreset = null;
          }
        }

        feature.update(viewport, zoom);
        this.retainFeature(feature, frame);

        // Same as above, but for the virtual POI, if any
        // Confirm that `feature.geometry.origPoi` exists - we may have skipped it if `feature.geometry.lod = 0`
        if (feature.poiFeatureID && feature.poiPreset && feature.geometry.origPoi) {
          let poiFeature = this.features.get(feature.poiFeatureID);

          if (!poiFeature) {
            poiFeature = new PixiFeaturePoint(this, feature.poiFeatureID);
            poiFeature.virtual = true;
            poiFeature.parentContainer = pointsContainer;
          }

          if (poiFeature.v !== version) {
            poiFeature.v = version;
            poiFeature.geometry.setCoords(feature.geometry.origPoi);  // pole of inaccessability
            poiFeature.setData(entityID, entity);
          }

          this.syncFeatureClasses(poiFeature);

          if (poiFeature.dirty) {
            let markerStyle = {
              iconName: feature.poiPreset.icon,
              iconTint: 0x111111,
              markerName: 'pin',
              markerTint: 0xffffff
            };

            if (hasWikidata(entity)) {
              markerStyle.iconTint = 0x444444;
              markerStyle.labelTint = 0xdddddd;
              markerStyle.markerName = 'boldPin';
              markerStyle.markerTint = 0xdddddd;
            }
            poiFeature.style = markerStyle;
            poiFeature.label = feature.label;
          }

          poiFeature.update(viewport, zoom);
          this.retainFeature(poiFeature, frame);
        }

      }
    }
  }


  /**
   * renderLines
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   * @param  data       Visible OSM data to render, sorted by type
   */
  renderLines(frame, viewport, zoom, data) {
    const entities = data.lines;
    const context = this.context;
    const graph = context.systems.editor.staging.graph;
    const l10n = context.systems.l10n;
    const styles = context.systems.styles;
    const lineContainer = this.lineContainer;

    for (const [entityID, entity] of entities) {
      const layer = (typeof entity.layer === 'function') ? entity.layer() : 0;
      const levelContainer = _getLevelContainer(layer.toString());
      const zindex = getzIndex(entity.tags);
      const version = entity.v || 0;

      // Cache GeoJSON resolution, as we expect the asGeoJSON call to be kinda slow.
      let geojson = this._resolved.get(entityID);
      if (geojson?.v !== version) {  // bust cache if the entity has a new version
        geojson = null;
      }
      if (!geojson) {
        geojson = entity.asGeoJSON(graph);
        geojson.v = version;
        if (geojson.type === 'LineString' && entity.tags.oneway === '-1') {
          geojson.coordinates.reverse();
        }
        this._resolved.set(entityID, geojson);
      }

      const parts = (geojson.type === 'LineString') ? [[geojson.coordinates]]
        : (geojson.type === 'Polygon') ? [geojson.coordinates]
        : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];

      for (let i = 0; i < parts.length; ++i) {
        const segments = parts[i];
        for (let j = 0; j < segments.length; ++j) {
          const coords = segments[j];
          const featureID = `${this.layerID}-${entityID}-${i}-${j}`;
          let feature = this.features.get(featureID);

          // If feature existed before as a different type, recreate it.
          if (feature && feature.type !== 'line') {
            feature.destroy();
            feature = null;
          }

          if (!feature) {
            feature = new PixiFeatureLine(this, featureID);
          }

          // If data has changed.. Replace data and parent-child links.
          if (feature.v !== version) {
            feature.v = version;
            feature.geometry.setCoords(coords);
            feature.parentContainer = levelContainer;    // Change layer stacking if necessary
            feature.container.zIndex = zindex;

            feature.setData(entityID, entity);
            feature.clearChildData(entityID);
            if (entity.type === 'relation') {
              entity.members.forEach(member => feature.addChildData(entityID, member.id));
            }
            if (entity.type === 'way') {
              entity.nodes.forEach(nodeID => feature.addChildData(entityID, nodeID));
            }
          }

          this.syncFeatureClasses(feature);

          if (feature.dirty) {
            let tags = entity.tags;
            let geom = entity.geometry(graph);

            // a line no tags - try to style match the tags of its parent relation
            if (!entity.hasInterestingTags()) {
              const parent = graph.parentRelations(entity).find(relation => relation.isMultipolygon());
              if (parent) {
                tags = parent.tags;
                geom = 'area';
              }
            }

            const style = styles.styleMatch(tags);
            // Todo: handle alternating/two-way case too
            if (geom === 'line') {
              style.lineMarkerName = entity.isOneWay() ? 'oneway' : '';
              style.sidedMarkerName = entity.isSided() ? 'sided' : '';
            } else {  // an area
              style.casing.width = 0;
              style.stroke.color = style.fill.color;
              style.stroke.width = 2;
              style.stroke.alpha = 1;
            }
            feature.style = style;

            feature.label = l10n.displayName(entity.tags);
          }

          feature.update(viewport, zoom);
          this.retainFeature(feature, frame);
        }
      }
    }


    function _getLevelContainer(level) {
      let levelContainer = lineContainer.getChildByName(level);
      if (!levelContainer) {
        levelContainer = new PIXI.Container();
        levelContainer.name = level.toString();
        levelContainer.sortableChildren = true;
        levelContainer.zIndex = level;
        lineContainer.addChild(levelContainer);
      }
      return levelContainer;
    }

  }


  /**
   * renderVertices
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   * @param  data       Visible OSM data to render, sorted by type
   * @param  realated   Collections of related OSM IDs
   */
  renderVertices(frame, viewport, zoom, data, related) {
    const entities = data.vertices;
    const context = this.context;
    const graph = context.systems.editor.staging.graph;
    const l10n = context.systems.l10n;
    const presets = context.systems.presets;

    // Vertices related to the selection/hover should be drawn above everything
    const mapUIContainer = this.scene.layers.get('map-ui').container;
    const selectedContainer = mapUIContainer.getChildByName('selected');
    const pointsContainer = this.scene.groups.get('points');

    function isInterestingVertex(node) {
      return node.hasInterestingTags() || node.isEndpoint(graph) || node.isIntersection(graph);
    }

    function isRelatedVertex(entityID) {
      return related.descendantIDs.has(entityID) || related.siblingIDs.has(entityID);
    }


    for (const [nodeID, node] of entities) {
      let parentContainer = null;

      if (zoom >= 16 && isInterestingVertex(node) ) {  // minor importance
        parentContainer = pointsContainer;
      }
      if (isRelatedVertex(nodeID)) {   // major importance
        parentContainer = selectedContainer;
      }

      if (!parentContainer) continue;   // this vertex isn't important enough to render

      const featureID = `${this.layerID}-${nodeID}`;
      const version = node.v || 0;
      let feature = this.features.get(featureID);

      // If feature existed before as a different type, recreate it.
      if (feature && feature.type !== 'point') {
        feature.destroy();
        feature = null;
      }

      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID);
      }

      // If data has changed, replace it.
      if (feature.v !== version) {
        feature.v = version;
        feature.geometry.setCoords(node.loc);
        feature.setData(nodeID, node);
      }

      this.syncFeatureClasses(feature);
      feature.parentContainer = parentContainer;   // change layer stacking if necessary

      if (feature.dirty) {
        const preset = presets.match(node, graph);
        const iconName = preset?.icon;
        const directions = node.directions(graph, context.viewport);

        // set marker style
        let markerStyle = {
          iconName: iconName,
          iconTint: 0x111111,
          labelTint: 0xeeeeee,
          markerName: 'smallCircle',
          markerTint: 0xffffff,
          viewfieldAngles: directions,
          viewfieldName: 'viewfieldDark',
          viewfieldTint: 0xffffff
        };

        if (iconName) {
          markerStyle.markerName = 'largeCircle';
          markerStyle.iconName = iconName;
        } else if (node.hasInterestingTags()) {
          markerStyle.markerName = 'taggedCircle';
        }

        if (hasWikidata(node)) {
          markerStyle.iconTint = 0x444444;
          markerStyle.labelTint = 0xdddddd;
          markerStyle.markerTint = 0xdddddd;
        }
        if (graph.isShared(node)) {     // shared nodes / junctions are more grey
          markerStyle.iconTint = 0x111111;
          markerStyle.labelTint = 0xbbbbbb;
          markerStyle.markerTint = 0xbbbbbb;
        }

        feature.style = markerStyle;
        feature.label = l10n.displayName(node.tags);
      }

      feature.update(viewport, zoom);
      this.retainFeature(feature, frame);
    }
  }


  /**
   * renderPoints
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   * @param  data       Visible OSM data to render, sorted by type
   */
  renderPoints(frame, viewport, zoom, data) {
    const entities = data.points;
    const context = this.context;
    const graph = context.systems.editor.staging.graph;
    const l10n = context.systems.l10n;
    const presets = context.systems.presets;
    const pointsContainer = this.scene.groups.get('points');

    for (const [nodeID, node] of entities) {
      const featureID = `${this.layerID}-${nodeID}`;
      const version = node.v || 0;
      let feature = this.features.get(featureID);

      // If feature existed before as a different type, recreate it.
      if (feature && feature.type !== 'point') {
        feature.destroy();
        feature = null;
      }

      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID);
        feature.parentContainer = pointsContainer;
      }

      // If data has changed, replace it.
      if (feature.v !== version) {
        feature.v = version;
        feature.geometry.setCoords(node.loc);
        feature.setData(nodeID, node);
      }

      this.syncFeatureClasses(feature);

      if (feature.dirty) {
        let preset = presets.match(node, graph);
        let iconName = preset?.icon;

        // If we matched a generic preset without an icon, try matching it as a 'vertex'
        // This is just to choose a better icon for an otherwise empty-looking pin.
        if (!iconName) {
          preset = presets.matchTags(node.tags, 'vertex');
          iconName = preset?.icon;
        }

        const directions = node.directions(graph, context.viewport);

        // set marker style
        let markerStyle = {
          iconName: iconName,
          iconTint: 0x111111,
          markerName: 'pin',
          markerTint: 0xffffff,
          viewfieldAngles: directions,
          viewfieldName: 'viewfieldDark',
          viewfieldTint: 0xffffff
        };

        if (hasWikidata(node)) {
          markerStyle.iconTint = 0x444444;
          markerStyle.labelTint = 0xdddddd;
          markerStyle.markerName = 'boldPin';
          markerStyle.markerTint = 0xdddddd;
        }
        if (preset.id === 'address') {
          markerStyle.iconName = 'maki-circle-stroked';
          markerStyle.markerName = 'largeCircle';
        }

        feature.style = markerStyle;
        feature.label = l10n.displayName(node.tags);
      }

      feature.update(viewport, zoom);
      this.retainFeature(feature, frame);
    }
  }


  /**
   * renderMidpoints
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   * @param  data       Visible OSM data to render, sorted by type
   * @param  related    Collections of related OSM IDs
   */
  renderMidpoints(frame, viewport, zoom, data, related) {
    const MIN_MIDPOINT_DIST = 40;   // distance in pixels
    const context = this.context;
    const graph = context.systems.editor.staging.graph;

    // Need to consider both lines and polygons for drawing our midpoints
    const entities = new Map([...data.lines, ...data.polygons]);

    // Midpoints should be drawn above everything
    const mapUIContainer = this.scene.layers.get('map-ui').container;
    const selectedContainer = mapUIContainer.getChildByName('selected');

    // Generate midpoints from all the highlighted ways
    let midpoints = new Map();
    const MIDPOINT_STYLE = { markerName: 'midpoint' };
    for (const [wayID, way] of entities) {
      // Include only ways that are selected, or descended from a relation that is selected
      if (!related.descendantIDs.has(wayID)) continue;

      // Include only actual ways that have child nodes
      const nodes = graph.childNodes(way);
      if (!nodes.length) continue;

      // Compute midpoints in projected coordinates
      let nodeData = nodes.map(node => {
        return {
          id: node.id,
          point: viewport.project(node.loc)
        };
      });

      if (way.tags.oneway === '-1') {
        nodeData.reverse();
      }

      for (let i = 0; i < nodeData.length - 1; i++) {
        const a = nodeData[i];
        const b = nodeData[i + 1];
        const midpointID = [a.id, b.id].sort().join('-');
        const dist = vecLength(a.point, b.point);
        if (dist < MIN_MIDPOINT_DIST) continue;

        const pos = vecInterp(a.point, b.point, 0.5);
        const rot = vecAngle(a.point, b.point) + viewport.transform.rotation;
        const loc = viewport.unproject(pos);  // store as wgs84 lon/lat
        const midpoint = {
          type: 'midpoint',
          id: midpointID,
          a: a,
          b: b,
          way: way,
          loc: loc,
          rot: rot
        };

        if (!midpoints.has(midpointID)) {
          midpoints.set(midpointID, midpoint);
        }
      }
    }

    for (const [midpointID, midpoint] of midpoints) {
      const featureID = `${this.layerID}-${midpointID}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID);
        feature.style = MIDPOINT_STYLE;
        feature.parentContainer = selectedContainer;
      }

      // Something about the midpoint has changed
      const v = _midpointVersion(midpoint);
      if (feature.v !== v) {
        feature.v = v;
        feature.geometry.setCoords(midpoint.loc);

        // Remember to apply rotation - it needs to go on the marker,
        // because the container automatically rotates to be face up.
        feature.marker.rotation = midpoint.rot;

        feature.setData(midpointID, midpoint);
        feature.addChildData(midpoint.way.id, midpointID);
      }

      this.syncFeatureClasses(feature);
      feature.update(viewport, zoom);
      this.retainFeature(feature, frame);
    }


    // If any of these change, the midpoint needs to be redrawn.
    // (This can happen if a sibling node has moved, the midpoint moves too)
    function _midpointVersion(d) {
      return d.loc[0] + d.loc[1] + d.rot;
    }

  }

}



const HIGHWAYSTACK = {
  motorway: 0,
  motorway_link: -1,
  trunk: -2,
  trunk_link: -3,
  primary: -4,
  primary_link: -5,
  secondary: -6,
  tertiary: -7,
  unclassified: -8,
  residential: -9,
  service: -10,
  busway: -11,
  track: -12,
  footway: -20
};


function getzIndex(tags) {
  return HIGHWAYSTACK[tags.highway] || 0;
}

// Special style for Wikidata-tagged items
function hasWikidata(entity) {
  return (
    entity.tags.wikidata ||
    entity.tags['flag:wikidata'] ||
    entity.tags['brand:wikidata'] ||
    entity.tags['network:wikidata'] ||
    entity.tags['operator:wikidata']
  );
}
