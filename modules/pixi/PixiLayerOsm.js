import * as PIXI from 'pixi.js';
import geojsonRewind from '@mapbox/geojson-rewind';
import { vecAngle, vecLength, vecInterp } from '@id-sdk/math';

import { services } from '../services';
import { presetManager } from '../presets';

import { PixiLayer } from './PixiLayer';
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
export class PixiLayerOsm extends PixiLayer {

  /**
   * @constructor
   * @param  context
   * @param  scene
   * @param  layerZ
   */
  constructor(context, scene, layerZ) {
    super(context, LAYERID, layerZ);
    this._enabled = true;  // OSM layers should be enabled by default
    this.scene = scene;

    this._service = null;
    this.getService();

    // On hover or selection, draw related vertices (above everything)
    this._relatedIDs = new Set();
    this._seenHighlightTick = null;

    // experiment for benchmarking
    this._alreadyDownloaded = false;
    this._saveCannedData = false;

    // Setup Scene
    //
    // A few definitions:
    //
    // - `buttonMode = true`    this displayObject will turn the cursor to a pointer when hovering over
    // - `buttonMode = false`   this displayObject will NOT turn the cursor to a pointer when hovering over (default)
    //
    // - `interactive = true`   this displayObject can emit events
    // - `interactive = false`  this displayObject can NOT emit events (default)
    //
    // - `interactiveChildren = true`   this container and its children will be checked for hits (default)
    // - `interactiveChildren = false`  this container and its children will NOT be checked for hits
    //
    // - `sortableChildren = true`   we will set a zIndex property on children and they will be sorted according to it
    // - `sortableChildren = false`  children will be drawn in the ordrer they are added to `children` array (default)
    //

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
   * @param  ids   Set of current ids that are selected or hovered
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
    const service = this.getService();
    const graph = context.graph();
    const map = context.map();

    if (this._enabled && service && zoom >= MINZOOM) {
      this.visible = true;

      context.loadTiles(context.projection);  // load OSM data that covers the view

      // Has select/hover highlighting chagned?
      const renderer = map.renderer();
      const currHighlightedIDs = renderer._highlightedIDs;
      if (this._seenHighlightTick !== renderer._highlightTick) {
        this._seenHighlightTick = renderer._highlightTick;
        this._updateRelatedIDs(currHighlightedIDs);
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
          if (currHighlightedIDs.has(entity.id)) {
            data.highlighted.push(entity);
          }
        } else if (geom === 'area') {
          data.polygons.push(entity);
          if (currHighlightedIDs.has(entity.id)) {
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
    const context = this.context;
    const scene = this.scene;
    const graph = context.graph();

    entities.forEach(entity => {
      let feature = scene.get(entity.id);

      if (!feature) {
        feature = new PixiFeatureMultipolygon(context, entity.id, areaContainer, entity);
      }

      this.seenFeature.set(feature, timestamp);
      feature.visible = true;

      // Something has changed since the last time we've styled this feature.
      const version = (entity.v || 0);
      if (feature.v !== version || feature.dirty) {
        feature.v = version;

        const dObj = feature.displayObject;
        const area = entity.extent(graph).area();  // estimate area from extent for speed
        dObj.zIndex = -area;                       // sort by area descending (small things above big things)
        dObj.__data__ = entity;                    // rebind data

        const geojson = geojsonRewind(entity.asGeoJSON(graph), true);
        const geometry = (geojson.type === 'Polygon') ? [geojson.coordinates]
          : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];
        feature.rebind(entity, geometry);

        const style = styleMatch(entity.tags);
        feature.style = style;
      }

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
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
    const context = this.context;
    const scene = this.scene;
    const graph = context.graph();

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

      let feature = scene.get(entity.id);

      // Create a new line if this entity is entering the scene.
      if (!feature) {
        // TODO make this dynamic too
        // Add this line to the correct level container (bridge/tunnel/etc)
        const lvl = entity.layer().toString();
        const levelContainer = getLevelContainer(lvl);

        feature = new PixiFeatureLine(context, entity.id, levelContainer, entity);
      }

      this.seenFeature.set(feature, timestamp);
      feature.visible = true;

      // Something has changed since the last time we've styled this feature.
      const version = (entity.v || 0);
      if (feature.v !== version || feature.dirty) {
        feature.v = version;
        const dObj = feature.displayObject;
        dObj.zIndex = getzIndex(entity.tags);

        const geojson = entity.asGeoJSON(graph);
        const geometry = geojson.coordinates;
        feature.rebind(entity, geometry); //rebind data


        const style = styleMatch(entity.tags);
        style.reversePoints = (entity.tags.oneway === '-1');

        // Todo: handle alternating/two-way case too
        style.lineMarkerName = entity.isOneWay() ? 'oneway' : '';

        feature.style = style;
        feature.label = utilDisplayName(entity);
      }

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
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


    entities.forEach(node => {
      let parentContainer = null;
      if (isInterestingVertex(node)) {
        parentContainer = vertexContainer;
      }
      if (this._relatedIDs.has(node.id)) {
        parentContainer = selectedContainer;
      }
      if (!parentContainer) return;   // this vertex isn't interesting enough to render

      let feature = scene.get(node.id);

      // Create a new point if this vertex is entering the scene.
      if (!feature) {
        feature = new PixiFeaturePoint(context, node.id, parentContainer, node, node.loc);
      }

      this.seenFeature.set(feature, timestamp);
      feature.visible = true;

      // Something has changed since the last time we've styled this feature.
      const version = (node.v || 0);
      if (feature.v !== version || feature.dirty) {
        feature.v = version;
        feature.rebind(node);
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
      if (feature.displayObject.parent !== parentContainer) {
        feature.displayObject.setParent(parentContainer);
      }

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
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
    const context = this.context;
    const scene = this.scene;
    const graph = context.graph();

    entities.forEach(node => {
      let feature = scene.get(node.id);

      // Create a new point if this point is entering the scene.
      if (!feature) {
        feature = new PixiFeaturePoint(context, node.id, pointContainer, node, node.loc);
      }

      this.seenFeature.set(feature, timestamp);
      feature.visible = true;

      // Something has changed since the last time we've styled this feature.
      const version = (node.v || 0);
      if (feature.v !== version) {
        feature.v = version;
        feature.rebind(node);

        const preset = presetManager.match(node, graph);
        const iconName = preset && preset.icon;
        const directions = node.directions(graph, context.projection);

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

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
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
    const MIN_DIST = 40;   // distance in pixels
    const context = this.context;
    const scene = this.scene;
    const graph = context.graph();

    // Midpoints should be drawn above everything
    const mapUIContainer = context.layers().getLayer('map-ui').container;
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
        if (dist < MIN_DIST) return;

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


/*    midpoints
      .forEach(function prepareMidpoints(midpoint) {
        let featureID = midpoint.id;
        let feature = scene.get(featureID);

        if (!feature) {
          const style = { markerName: 'midpoint' };
          feature = new PixiFeaturePoint(context, featureID, this.container, midpoint, midpoint.loc, style);
          feature.displayObject.rotation = midpoint.rot;  // remember to apply rotation
        }

        if (feature.dirty) {
          feature.update(projection, zoom);
          scene.update(feature);
        }
      });
*/
    midpoints.forEach(midpoint => {
      let feature = scene.get(midpoint.id);

      // Create a new midpoint if entering the scene
      if (!feature) {
        const style = { markerName: 'midpoint' };
        feature = new PixiFeaturePoint(context, midpoint.id, selectedContainer, midpoint, midpoint.loc, style);
      }

      this.seenFeature.set(feature, timestamp);
      feature.visible = true;

      // Something about the midpoint has changed
      // Here we use the midpoint location as it's "version"
      if (feature.v !== midpoint.loc || feature.dirty) {
        feature.v = midpoint.loc;
        feature.rebind(midpoint);
        feature.geometry = midpoint.loc;
        feature.displayObject.rotation = midpoint.rot;  // remember to apply rotation
      }

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
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
