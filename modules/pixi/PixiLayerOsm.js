import * as PIXI from 'pixi.js';
import geojsonRewind from '@mapbox/geojson-rewind';
import { vecAngle, vecLength, vecInterp } from '@id-sdk/math';

import { services } from '../services';
import { presetManager } from '../presets';

import { AbstractLayer } from './AbstractLayer';
import { PixiFeatureLine } from './PixiFeatureLine';
import { PixiFeaturePoint } from './PixiFeaturePoint';
import { PixiFeatureMultipolygon } from './PixiFeatureMultipolygon';
import { utilDisplayName } from '../util';
import { styleMatch } from './styles';

const LAYERID = 'osm';
const MINZOOM = 12;


/**
 * PixiLayerOsm
 * @class
 */
export class PixiLayerOsm extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerZ   z-index to assign to this layer's container
   */
  constructor(scene, layerZ) {
    super(scene, LAYERID, layerZ);

    this._enabled = true;  // OSM layers should be enabled by default
    this._service = null;
    this.getService();

    // On hover or selection, draw related vertices (above everything)
    this._relatedIDs = new Set();
    this._prevSelectTick = -1;
    this._prevHoverTick = -1;

    // experiment for benchmarking
    this._alreadyDownloaded = false;
    this._saveCannedData = false;

    const areas = new PIXI.Container();
    areas.name = `${LAYERID}-areas`;
    areas.sortableChildren = true;

    const lines = new PIXI.Container();
    lines.name = `${LAYERID}-lines`;
    lines.sortableChildren = true;

    const vertices = new PIXI.Container();
    vertices.name = `${LAYERID}-vertices`;
    vertices.sortableChildren = true;

    const points = new PIXI.Container();
    points.name = `${LAYERID}-points`;
    points.sortableChildren = true;

    this.container.addChild(areas, lines, vertices, points);
  }


  /**
   * Services are loosely coupled in iD, so we use a `getService` function
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
   * Whether the layer's service exists
   */
  get supported() {
    return !!this.getService();
  }


  /**
   * _updateRelatedIDs
   * On any change in selection or hovering, we should check for which vertices
   * become interesting enough to render
   * @param  ids   `Set` of ids that are selected or hovered
   */
  _updateRelatedIDs(ids) {
    const context = this.context;
    const graph = context.graph();
    let seen = new Set();   // avoid infinite recursion, handle circular relations
    let result = new Set();

    function addChildVertices(entity) {
      if (seen.has(entity.id)) return;
      seen.add(entity.id);

      if (entity.type === 'way') {
        for (let i = 0; i < entity.nodes.length; i++) {
          const child = graph.hasEntity(entity.nodes[i]);
          if (child) {
            addChildVertices(child);
          }
        }
      } else if (entity.type === 'relation') {
        for (let i = 0; i < entity.members.length; i++) {
          const member = graph.hasEntity(entity.members[i].id);
          if (member) {
            addChildVertices(member);
          }
        }
      } else {  // a node
        result.add(entity.id);
      }
    }

    ids.forEach(id => {
      const entity = graph.hasEntity(id);
      if (!entity) return;

      if (entity.type === 'node') {
        result.add(entity.id);
        graph.parentWays(entity).forEach(entity => addChildVertices(entity));
      } else {  // way, relation
        addChildVertices(entity);
      }
    });

    this._relatedIDs = result;
    return this._relatedIDs;
  }


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
   * Draw any data we have, and schedule fetching more of it to cover the view
   * @param  timestamp    timestamp in milliseconds
   * @param  projection   pixi projection to use for rendering
   * @param  zoom         effective zoom to use for rendering
   */
  render(timestamp, projection, zoom) {
    const context = this.context;
    const scene = this.scene;
    const service = this.getService();
    const graph = context.graph();
    const map = context.map();

    if (this._enabled && service && zoom >= MINZOOM) {
      this.visible = true;

      context.loadTiles(context.projection);  // Load tiles of OSM data to cover the view

      // Has select/hover highlighting chagned?
      const highlightedIDs = new Set([...scene.selected, ...scene.hovered]);
      if (this._prevSelectTick !== scene.selectTick || this._prevHoverTick !== scene.hoverTick) {
        this._prevSelectTick = scene.selectTick;
        this._prevHoverTick = scene.hoverTick;
        this._updateRelatedIDs(highlightedIDs);
      }

      const entities = context.history().intersects(map.extent());

      // Gather data
      let data = { points: [], vertices: [], lines: [], polygons: [], highlighted: [] };

      entities.forEach(entity => {
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
          data.polygons.push(entity);
          if (highlightedIDs.has(entity.id)) {
            data.highlighted.push(entity);
          }
        }
      });


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


      this.drawPolygons(timestamp, projection, zoom, data.polygons);
      this.drawLines(timestamp, projection, zoom, data.lines);
      this.drawVertices(timestamp, projection, zoom, data.vertices);
      this.drawPoints(timestamp, projection, zoom, data.points);
      this.drawMidpoints(timestamp, projection, zoom, data.highlighted);

      this.cull(timestamp);

    } else {
      this.visible = false;
    }
  }


  /**
   * drawPolygons
   * @param  timestamp    timestamp in milliseconds
   * @param  projection   a pixi projection
   * @param  zoom         the effective zoom to use for rendering
   * @param  entities     Array of OSM entities (ways/relations with area geometry)
   */
  drawPolygons(timestamp, projection, zoom, entities) {
    const areaContainer = this.container.getChildByName(`${LAYERID}-areas`);
    const scene = this.scene;
    const graph = this.context.graph();

    entities.forEach(entity => {
      let feature = scene.get(entity.id);
      if (!feature) {
        feature = new PixiFeatureMultipolygon(this, entity.id, areaContainer, entity);
      }

      // Something has changed since the last time we've styled this feature.
      const version = (entity.v || 0);
      if (feature.v !== version || feature.dirty) {
        feature.v = version;
        feature.data = entity;   // rebind data

        const area = entity.extent(graph).area();  // estimate area from extent for speed
        feature.container.zIndex = -area;      // sort by area descending (small things above big things)

        const geojson = geojsonRewind(entity.asGeoJSON(graph), true);
        const geometry = (geojson.type === 'Polygon') ? [geojson.coordinates]
          : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];
        feature.geometry = geometry;

        const style = styleMatch(entity.tags);
        feature.style = style;
      }

      feature.selected = scene.selected.has(feature.id);
      feature.hovered = scene.hovered.has(feature.id);

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
      }

      if (feature.lod > 0 || feature.selected) {
        feature.visible = true;
        this.seenFeature.set(feature, timestamp);
      }
    });
  }


  /**
   * drawLines
   * @param  timestamp    timestamp in milliseconds
   * @param  projection   a pixi projection
   * @param  zoom         the effective zoom to use for rendering
   * @param  entities     Array of OSM entities (ways/relations with line geometry)
   */
  drawLines(timestamp, projection, zoom, entities) {
    const lineContainer = this.container.getChildByName(`${LAYERID}-lines`);
    const scene = this.scene;
    const graph = this.context.graph();

    function getLevelContainer(level) {
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

    function isUntaggedMultipolygonRing(entity) {
      if (entity.hasInterestingTags()) return false;
      return graph.parentRelations(entity).some(relation => relation.isMultipolygon());
    }


    entities.forEach(entity => {
      // Skip untagged multipolygon rings for now, drawPolygons will render them as strokes.
      // At some point we will want the user to be able to click on them though
      if (isUntaggedMultipolygonRing(entity)) return;

      // Make sure this line is on the correct level container (bridge/tunnel/etc)
      const lvl = entity.layer().toString();
      const levelContainer = getLevelContainer(lvl);

      let feature = scene.get(entity.id);
      if (!feature) {
        feature = new PixiFeatureLine(this, entity.id, levelContainer, entity);
      }

      // Something has changed since the last time we've styled this feature.
      const version = (entity.v || 0);
      if (feature.v !== version || feature.dirty) {
        feature.v = version;
        feature.data = entity;  // rebind data
        feature.container.zIndex = getzIndex(entity.tags);

        const geojson = entity.asGeoJSON(graph);
        const geometry = geojson.coordinates;
        feature.geometry = geometry;

        const style = styleMatch(entity.tags);
        style.reversePoints = (entity.tags.oneway === '-1');
        // Todo: handle alternating/two-way case too

        style.lineMarkerName = entity.isOneWay() ? 'oneway' : '';
        style.sidedMarkerName = entity.isSided() ? 'sided' : '';
        feature.style = style;

        feature.label = utilDisplayName(entity);
      }

      // Change parent if necessary
      if (feature.container.parent !== levelContainer) {
        feature.container.setParent(levelContainer);
      }

      feature.selected = scene.selected.has(feature.id);
      feature.hovered = scene.hovered.has(feature.id);

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
      }

      if (feature.lod > 0 || feature.selected) {
        feature.visible = true;
        this.seenFeature.set(feature, timestamp);
      }
    });
  }


  /**
   * drawVertices
   * @param  timestamp    timestamp in milliseconds
   * @param  projection   pixi projection to use for rendering
   * @param  zoom         effective zoom to use for rendering
   * @param  entities     Array of OSM entities (nodes with vertex geometry)
   */
  drawVertices(timestamp, projection, zoom, entities) {
    const context = this.context;
    const scene = this.scene;
    const graph = context.graph();

    // Most vertices should be children of the vertex container
    const vertexContainer = this.container.getChildByName(`${LAYERID}-vertices`);
    // Vertices related to the selection/hover should be drawn above everything
    const mapUIContainer = context.layers().getLayer('map-ui').container;
    const selectedContainer = mapUIContainer.getChildByName('selected');

    function isInterestingVertex(entity) {
      return entity.type === 'node' && entity.geometry(graph) === 'vertex' && (
        entity.hasInterestingTags() || entity.isEndpoint(graph) || entity.isIntersection(graph)
      );
    }

// deal with "active" here?
const activeData = context.activeData();

    entities.forEach(node => {
      let parentContainer = null;
      if (zoom >= 16 && isInterestingVertex(node)) {
        parentContainer = vertexContainer;
      }
      if (this._relatedIDs.has(node.id)) {
        parentContainer = selectedContainer;
      }
      if (!parentContainer) return;   // this vertex isn't interesting enough to render

      let feature = scene.get(node.id);
      if (!feature) {
        feature = new PixiFeaturePoint(this, node.id, parentContainer, node, node.loc);
      }

      // Something has changed since the last time we've styled this feature.
      const version = (node.v || 0);
      if (feature.v !== version || feature.dirty) {
        feature.v = version;
        feature.data = node;   // rebind data
        feature.geometry = node.loc;

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

      // change parent if necessary
      if (feature.container.parent !== parentContainer) {
        feature.container.setParent(parentContainer);
      }

      feature.interactive = !activeData.has(feature.id);
      feature.selected = scene.selected.has(feature.id);
      feature.hovered = scene.hovered.has(feature.id);

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
      }

      if (feature.lod > 0 || feature.selected) {
        feature.visible = true;
        this.seenFeature.set(feature, timestamp);
      }
    });
  }


  /**
   * drawPoints
   * @param  timestamp    timestamp in milliseconds
   * @param  projection   pixi projection to use for rendering
   * @param  zoom         effective zoom to use for rendering
   * @param  entities     Array of OSM entities (nodes with point geometry)
   */
  drawPoints(timestamp, projection, zoom, entities) {
    const pointContainer = this.container.getChildByName(`${LAYERID}-points`);
    const scene = this.scene;
    const graph = this.context.graph();

    entities.forEach(node => {
      let feature = scene.get(node.id);
      if (!feature) {
        feature = new PixiFeaturePoint(this, node.id, pointContainer, node, node.loc);
      }

      // Something has changed since the last time we've styled this feature.
      const version = (node.v || 0);
      if (feature.v !== version || feature.dirty) {
        feature.v = version;
        feature.data = node;   // rebind data
        feature.geometry = node.loc;

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

      feature.selected = scene.selected.has(feature.id);
      feature.hovered = scene.hovered.has(feature.id);

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
      }

      if (feature.lod > 0 || feature.selected) {
        feature.visible = true;
        this.seenFeature.set(feature, timestamp);
      }
    });
  }


  /**
   * drawMidpoints
   * @param  timestamp    timestamp in milliseconds
   * @param  projection   pixi projection to use for rendering
   * @param  zoom         effective zoom to use for rendering
   * @param  entities     Array of OSM entities (ways with highlight)
   */
  drawMidpoints(timestamp, projection, zoom, entities) {
    const MIN_MIDPOINT_DIST = 40;   // distance in pixels
    const scene = this.scene;
    const graph = this.context.graph();

    // Midpoints should be drawn above everything
    const mapUIContainer = this.context.layers().getLayer('map-ui').container;
    const selectedContainer = mapUIContainer.getChildByName('selected');

    // Generate midpoints from all the highlighted ways
    let midpoints = new Map();

    entities.forEach(way => {
      const nodes = graph.childNodes(way);
      if (!nodes.length) return;  // maybe a relation?

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
    });

    midpoints.forEach(midpoint => {
      let feature = scene.get(midpoint.id);
      if (!feature) {
        const style = { markerName: 'midpoint' };
        feature = new PixiFeaturePoint(this, midpoint.id, selectedContainer, midpoint, midpoint.loc, style);
      }

      // Something about the midpoint has changed
      // Here we use the midpoint location as it's "version"
      if (feature.v !== midpoint.loc || feature.dirty) {
        feature.v = midpoint.loc;
        feature.data = midpoint;
        feature.geometry = midpoint.loc;
        feature.container.rotation = midpoint.rot;  // remember to apply rotation
      }

      feature.selected = scene.selected.has(feature.id);
      feature.hovered = scene.hovered.has(feature.id);

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
      }

      if (feature.lod > 0 || feature.selected) {
        feature.visible = true;
        this.seenFeature.set(feature, timestamp);
      }
    });
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
