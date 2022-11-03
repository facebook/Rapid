import * as PIXI from 'pixi.js';
import geojsonRewind from '@mapbox/geojson-rewind';
import { vecAngle, vecLength, vecInterp } from '@id-sdk/math';

import { services } from '../services';
import { presetManager } from '../presets';

import { AbstractLayer } from './AbstractLayer';
import { PixiFeatureLine } from './PixiFeatureLine';
import { PixiFeaturePoint } from './PixiFeaturePoint';
import { PixiFeaturePolygon } from './PixiFeaturePolygon';
import { utilDisplayName } from '../util';
import { styleMatch } from './styles';

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

    const basemapContainer = this.scene.groups.get('basemap');

    this._enabled = true;  // OSM layers should be enabled by default
    this._service = null;
    this._resolved = new Map();  // Map (entity.id -> GeoJSON feature)

    this.getService();

    // On hover or selection, draw related vertices (above everything)
    this._relatedOsmIDs = new Set();
    this._prevSelectV = -1;   // last seen selected version
    this._prevHoverV = -1;    // last seen hovered version

    // experiment for benchmarking
    this._alreadyDownloaded = false;
    this._saveCannedData = false;

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
   * Services are loosely coupled in RapiD, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    if (services.osm && !this._service) {
      this._service = services.osm;
    } else if (!services.osm && this._service) {
      this._service = null;
    }

    return this._service;
  }


  /**
   * supported
   * Whether the Layer's service exists
   */
  get supported() {
    return !!this.getService();
  }

//
//  /**
//   * _updateRelatedOsmIds
//   * On any change in selection or hovering, we should check for which vertices
//   * become interesting enough to render
//   * @param  osmids   `Set` of OSM ids that are selected or hovered
//   */
//  _updateRelatedOsmIds(osmids) {
//    const context = this.context;
//    const graph = context.graph();
//    let seen = new Set();   // avoid infinite recursion, handle circular relations
//    let result = new Set();
//
//    function addChildVertices(entity) {
//      if (seen.has(entity.id)) return;
//      seen.add(entity.id);
//
//      if (entity.type === 'way') {
//        for (let i = 0; i < entity.nodes.length; i++) {
//          const child = graph.hasEntity(entity.nodes[i]);
//          if (child) {
//            addChildVertices(child);
//          }
//        }
//      } else if (entity.type === 'relation') {
//        for (let i = 0; i < entity.members.length; i++) {
//          const member = graph.hasEntity(entity.members[i].id);
//          if (member) {
//            addChildVertices(member);
//          }
//        }
//      } else {  // a node
//        result.add(`osm-${entity.id}`);
//      }
//    }
//
//    osmids.forEach(id => {
//      const entity = graph.hasEntity(id);
//      if (!entity) return;
//
//      if (entity.type === 'node') {
//        result.add(`osm-${entity.id}`);
//        graph.parentWays(entity).forEach(entity => addChildVertices(entity));
//      } else {  // way, relation
//        addChildVertices(entity);
//      }
//    });
//
//    this._relatedOsmIDs = result;
//    return this._relatedOsmIDs;
//  }
//

  /**
   * downloadFile
   * experiment for benchmarking
   * @param  data
   * @param  fileName
   */
  downloadFile(data, fileName) {
    let a = document.createElement('a');   // Create an invisible A element
    a.style.display = 'none';
    document.body.appendChild(a);

    // Set the HREF to a Blob representation of the data to be downloaded
    a.href = window.URL.createObjectURL(new Blob([data]));

    // Use download attribute to set set desired file name
    a.setAttribute('download', fileName);

    // Trigger the download by simulating click
    a.click();

    // Cleanup
    window.URL.revokeObjectURL(a.href);
    document.body.removeChild(a);
  }


  /**
   * render
   * Render any data we have, and schedule fetching more of it to cover the view
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  render(frame, projection, zoom) {
    const context = this.context;
    const service = this.getService();
    const graph = context.graph();
    const map = context.map();

    if (!this._enabled || !service || zoom < MINZOOM) return;

    context.loadTiles(context.projection);  // Load tiles of OSM data to cover the view

    // Has select/hover highlighting chagned?
    const highlightedIDs = new Set();
//      const highlightedIDs = new Set([...scene.selected, ...scene.hovered]);
//console.log(`highlightedIDs = ` + Array.from(highlightedIDs));
//      if (this._prevSelectV !== scene.selected.v || this._prevHoverV !== scene.hovered.v) {
//        this._prevSelectV = scene.selected.v;
//        this._prevHoverV = scene.hovered.v;
//
//// convert feature id to osm id
//let osmids = new Set();
//highlightedIDs.forEach(featureID => {
//  const feat = this.features.get(featureID);
//  if (feat && feat.data) {
//    osmids.add(feat.data.id);
//  }
//});
////        this._updateRelatedOsmIds(osmids);
//      }

    let entities = context.history().intersects(map.extent());
    //Filter the entities according to features enabled/disabled
    entities = context.features().filter(entities, this.context.graph());

    // Gather data
    let data = { points: [], vertices: [], lines: [], polygons: [], highlighted: [] };

    for (const entity of entities) {
      const geom = entity.geometry(graph);
      if (geom === 'point') {
        data.points.push(entity);
      } else if (geom === 'vertex') {
        data.vertices.push(entity);
      } else if (geom === 'line') {
        data.lines.push(entity);
        if (highlightedIDs.has(entity.id)) {
          data.highlighted.push(entity);
        }
      } else if (geom === 'area') {
        data.lines.push(entity);
        data.polygons.push(entity);
        if (highlightedIDs.has(entity.id)) {
          data.highlighted.push(entity);
        }
      }
    }

    // Instructions to save 'canned' entity data for use in the renderer test suite:
    // Set a breakpoint at the next line, then modify `this._saveCannedData` to be 'true'
    // continuing will fire off the download of the data into a file called 'canned_data.json'.
    // move the data into the test/spec/renderer directory.
    if (this._saveCannedData && !this._alreadyDownloaded) {
      const map = context.map();
      const [lng, lat] = map.center();

      let viewData = {
        'lng': lng,
        'lat': lat,
        'zoom': zoom,
        'width': window.innerWidth,
        'height': window.innerHeight,
        'projection': projection,
        'data': data,
        'entities': context.graph().base().entities
      };

      let cannedData = JSON.stringify(viewData);
      this.downloadFile(cannedData,`${zoom}_${lat}_${lng}_canned_osm_data.json`);
      this._alreadyDownloaded = true;
    }


    this.renderPolygons(frame, projection, zoom, data.polygons);
    this.renderLines(frame, projection, zoom, data.lines);
    this.renderVertices(frame, projection, zoom, data.vertices);
    this.renderPoints(frame, projection, zoom, data.points);

// bhousel 8/8
// Midpoints are painful right now because they grab the hoverstate and de-select the line
// We haven't decided yet how to capture that features relate to one another so I'm commenting them out.
// bhousel 10/10
// update, we're startint to capture how features relate to one another now.
//      // No midpoints when drawing
    const currMode = context.mode().id;
    if (currMode === 'browse' || currMode === 'select') {
      this.renderMidpoints(frame, projection, zoom, data.highlighted);
    }
  }


  /**
   * renderPolygons
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  entities     Array of OSM entities (ways/relations with area geometry)
   */
  renderPolygons(frame, projection, zoom, entities) {
    const graph = this.context.graph();

    for (const entity of entities) {
      const entityVersion = (entity.v || 0);

      // Cache GeoJSON resolution, as we expect the rewind and asGeoJSON calls to be kinda slow.
      let geojson = this._resolved.get(entity.id);
      if (geojson?.v !== entityVersion) {  // bust cache if the entity has a new verison
        geojson = null;
      }
      if (!geojson) {
        geojson = geojsonRewind(entity.asGeoJSON(graph), true);
        geojson.v = entityVersion;
        this._resolved.set(entity.id, geojson);
      }

      const parts = (geojson.type === 'Polygon') ? [geojson.coordinates]
        : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];

      for (let i = 0, coords = parts[i]; i < parts.length; ++i) {
        const featureID = `${this.layerID}-${entity.id}-fill-${i}`;
        let feature = this.features.get(featureID);

        if (feature && feature.type !== 'polygon') {  // if feature type has changed, recreate it
          feature.destroy();
          feature = null;
        }

        if (!feature) {
          feature = new PixiFeaturePolygon(this, featureID);
          feature.parentContainer = this.areaContainer;
        }

        if (feature?.v !== entityVersion) {   // update coords and bound data
          feature.v = entityVersion;

          feature.geometry.setCoords(coords);
          const area = feature.geometry.origExtent.area();   // estimate area from extent for speed
          feature.container.zIndex = -area;      // sort by area descending (small things above big things)

          feature.bindData(entity, entity.id);
          if (entity.type === 'relation') {
            entity.members.forEach(member => {
              feature.addChildData(entity.id, member.id);
            });
          }
        }

        this.syncFeatureClasses(feature);

        if (feature.dirty) {
          const style = styleMatch(entity.tags);
          feature.style = style;
        }

        feature.update(projection, zoom);
        this.retainFeature(feature, frame);
      }
    }
  }


  /**
   * renderLines
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  entities     Array of OSM entities (ways/relations with line geometry)
   */
  renderLines(frame, projection, zoom, entities) {
    const graph = this.context.graph();
    const lineContainer = this.lineContainer;

    for (const entity of entities) {
      const entityVersion = (entity.v || 0);
      const layer = (typeof entity.layer === 'function') ? entity.layer() : 0;
      const levelContainer = _getLevelContainer(layer.toString());
      const zindex = getzIndex(entity.tags);

      // Cache GeoJSON resolution, as we expect the rewind and asGeoJSON calls to be kinda slow.
      let geojson = this._resolved.get(entity.id);
      if (geojson?.v !== entityVersion) {  // bust cache if the entity has a new verison
        geojson = null;
      }
      if (!geojson) {
        geojson = geojsonRewind(entity.asGeoJSON(graph), true);
        geojson.v = entityVersion;
        if (geojson.type === 'LineString' && entity.tags.oneway === '-1') {
          geojson.coordinates.reverse();
        }
        this._resolved.set(entity.id, geojson);
      }

      const parts = (geojson.type === 'LineString') ? [[geojson.coordinates]]
        : (geojson.type === 'Polygon') ? [geojson.coordinates]
        : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];

      for (let i = 0, segments = parts[i]; i < parts.length; ++i) {
        for (let j = 0, coords = segments[j]; j < segments.length; ++j) {
          const featureID = `${this.layerID}-${entity.id}-${i}-${j}`;
          let feature = this.features.get(featureID);

          if (feature && feature.type !== 'line') {  // if feature type has changed, recreate it
            feature.destroy();
            feature = null;
          }

          if (!feature) {
            feature = new PixiFeatureLine(this, featureID);
          }

          if (feature?.v !== entityVersion) {   // update coords and bound data
            feature.v = entityVersion;
            feature.geometry.setCoords(coords);
            feature.parentContainer = levelContainer;    // Change layer stacking if necessary
            feature.container.zIndex = zindex;
            feature.bindData(entity, entity.id);

            if (entity.type === 'relation') {
              entity.members.forEach(member => {
                feature.addChildData(entity.id, member.id);
              });
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

            const style = styleMatch(tags);
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

            feature.label = utilDisplayName(entity);
          }

          feature.update(projection, zoom);
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
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  entities     Array of OSM entities (nodes with vertex geometry)
   */
  renderVertices(frame, projection, zoom, entities) {
    const context = this.context;
    const graph = context.graph();

    // Vertices related to the selection/hover should be drawn above everything
    const mapUIContainer = this.scene.layers.get('map-ui').container;
    const selectedContainer = mapUIContainer.getChildByName('selected');
    const pointsContainer = this.scene.groups.get('points');

    function isInterestingVertex(entity) {
      // const featureID = `${this.layerID}-${entity.id}`;
      return entity.type === 'node' && entity.geometry(graph) === 'vertex' && (
        entity.hasInterestingTags() || entity.isEndpoint(graph) /*|| scene.drawing.has(featureID)*/ ||  entity.isIntersection(graph)
      );
    }

    for (const node of entities) {
      let parentContainer = null;
      if (zoom >= 16 && isInterestingVertex(node)) {
        parentContainer = pointsContainer;
      }
      if (this._relatedOsmIDs.has(node.id)) {
        parentContainer = selectedContainer;
      }
      if (!parentContainer) continue;   // this vertex isn't interesting enough to render

      const featureID = `${this.layerID}-${node.id}`;
      let feature = this.features.get(featureID);

      if (feature && feature.type !== 'point') {  // if feature type has changed, recreate it
        feature.destroy();
        feature = null;
      }

      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID);
      }

      const version = (node.v || 0);  // If data has changed, rebind
      if (feature.v !== version) {
        feature.v = version;
        feature.bindData(node, node.id);
      }

      this.syncFeatureClasses(feature);
      feature.parentContainer = parentContainer;   // change layer stacking if necessary

      if (feature.dirty) {
        feature.geometry.setCoords(node.loc);

        const preset = presetManager.match(node, graph);
        const iconName = preset && preset.icon;
        const directions = node.directions(graph, context.projection);

        // set marker style
        let markerStyle = {
          markerName: 'smallCircle',
          markerTint: 0xffffff,
          labelTint: 0xffffff,
          viewfieldAngles: directions,
          viewfieldName: 'viewfieldDark',
          viewfieldTint: 0xffffff,
          iconName: iconName,
          iconAlpha: 1
        };

        if (iconName) {
          markerStyle.markerName = 'largeCircle';
          markerStyle.iconName = iconName;
        } else if (node.hasInterestingTags()) {
          markerStyle.markerName = 'taggedCircle';
        }

        if (hasWikidata(node)) {
          markerStyle.markerTint = 0xdddddd;
          markerStyle.labelTint = 0xdddddd;
          markerStyle.iconAlpha = 0.6;
        }
        if (graph.isShared(node)) {     // shared nodes / junctions are more grey
          markerStyle.markerTint = 0xbbbbbb;
          markerStyle.labelTint = 0xbbbbbb;
        }

        feature.style = markerStyle;
        feature.label = utilDisplayName(node);
      }

      feature.update(projection, zoom);
      this.retainFeature(feature, frame);
    }
  }


  /**
   * renderPoints
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  entities     Array of OSM entities (nodes with point geometry)
   */
  renderPoints(frame, projection, zoom, entities) {
    const graph = this.context.graph();
    const pointsContainer = this.scene.groups.get('points');

    for (const node of entities) {
      const featureID = `${this.layerID}-${node.id}`;
      let feature = this.features.get(featureID);

      if (feature && feature.type !== 'point') {  // if feature type has changed, recreate it
        feature.destroy();
        feature = null;
      }

      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID);
        feature.parentContainer = pointsContainer;
      }

      const version = (node.v || 0);  // If data has changed, rebind
      if (feature.v !== version) {
        feature.v = version;
        feature.bindData(node, node.id);
      }

      this.syncFeatureClasses(feature);

      if (feature.dirty) {
        feature.geometry.setCoords(node.loc);

        const preset = presetManager.match(node, graph);
        const iconName = preset && preset.icon;
        const directions = node.directions(graph, this.context.projection);

        // set marker style
        let markerStyle = {
          markerName: 'pin',
          markerTint: 0xffffff,
          viewfieldAngles: directions,
          viewfieldName: 'viewfieldDark',
          viewfieldTint: 0xffffff,
          iconName: iconName,
          iconAlpha: 1
        };

        if (hasWikidata(node)) {
          markerStyle.markerName = 'boldPin';
          markerStyle.markerTint = 0xdddddd;
          markerStyle.labelTint = 0xdddddd;
          markerStyle.iconAlpha = 0.6;
        }
        if (preset.id === 'address') {
          markerStyle.markerName = 'largeCircle';
          markerStyle.iconName = 'maki-circle-stroked';
        }

        feature.style = markerStyle;
        feature.label = utilDisplayName(node);
      }

      feature.update(projection, zoom);
      this.retainFeature(feature, frame);
    }
  }


  /**
   * renderMidpoints
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  entities     Array of OSM entities (ways with highlight)
   */
  renderMidpoints(frame, projection, zoom, entities) {
    const MIN_MIDPOINT_DIST = 40;   // distance in pixels
    const graph = this.context.graph();

    // Midpoints should be drawn above everything
    const mapUIContainer = this.scene.layers.get('map-ui').container;
    const selectedContainer = mapUIContainer.getChildByName('selected');

    // Generate midpoints from all the highlighted ways
    let midpoints = new Map();
    const MIDPOINT_STYLE = { markerName: 'midpoint' };

    for (const way of entities) {
      const nodes = graph.childNodes(way);
      if (!nodes.length) continue;  // maybe a relation?

      // Compute midpoints in projected coordinates
      let nodeData = nodes.map(node => {
        return {
          id: node.id,
          point: projection.project(node.loc)
        };
      });

      if (way.tags.oneway === '-1') {
        nodeData.reverse();
      }

      nodeData.slice(0, -1).forEach((_, i) => {
        const a = nodeData[i];
        const b = nodeData[i + 1];
        const id = [a.id, b.id].sort().join('-');
        const dist = vecLength(a.point, b.point);
        if (dist < MIN_MIDPOINT_DIST) return;

        const pos = vecInterp(a.point, b.point, 0.5);
        const rot = vecAngle(a.point, b.point);
        const loc = projection.invert(pos);  // store as wgs84 lon/lat
        const midpoint = {
          type: 'midpoint',
          id: id,
          a: a,
          b: b,
          way: way,
          loc: loc,
          rot: rot
        };

        if (!midpoints.has(id)) {
          midpoints.set(id, midpoint);
        }
      });
    }

    for (const midpoint of midpoints) {
      const featureID = `${this.layerID}-${midpoint.id}`;
      let feature = this.features.get(featureID);

      if (feature && feature.type !== 'point') {  // if feature type has changed, recreate it
        feature.destroy();
        feature = null;
      }
      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID);
        feature.style = MIDPOINT_STYLE;
        feature.parentContainer = selectedContainer;
      }

      // Something about the midpoint has changed
      // Here we use the midpoint location as it's "version"
      if (feature.v !== midpoint.loc) {
        feature.v = midpoint.loc;
        feature.bindData(midpoint, midpoint.id);
        feature.addChildData(midpoint.way.id, midpoint.id);
      }

      this.syncFeatureClasses(feature);

      if (feature.dirty) {
        feature.geometry.setCoords(midpoint.loc);
        feature.container.rotation = midpoint.rot;  // remember to apply rotation
      }

      feature.update(projection, zoom);
      this.retainFeature(feature, frame);
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
  track: -11,
  footway: -12
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
