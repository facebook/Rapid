import * as PIXI from 'pixi.js';
import geojsonRewind from '@mapbox/geojson-rewind';

import { services } from '../services';
import { presetManager } from '../presets';

import { PixiLayer } from './PixiLayer';
import { PixiFeatureLine } from './PixiFeatureLine';
import { PixiFeaturePoint } from './PixiFeaturePoint';
import { PixiFeatureMultipolygon } from './PixiFeatureMultipolygon';
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
   * @param context
   * @param scene
   * @param layerZ
   */
  constructor(context, scene, layerZ) {
    super(context, LAYERID, layerZ);
    this._enabled = true;  // OSM layers should be enabled by default
    this.scene = scene;

    this._service = null;
    this.getService();

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
    areas.interactive = true;
    areas.sortableChildren = true;

    const lines = new PIXI.Container();
    lines.name = `${LAYERID}-lines`;
    lines.interactive = true;
    lines.sortableChildren = true;

    const vertices = new PIXI.Container();
    vertices.name = `${LAYERID}-vertices`;
    vertices.interactive = false;
    vertices.sortableChildren = true;

    const points = new PIXI.Container();
    points.name = `${LAYERID}-points`;
    points.interactive = true;
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
   * render
   * Draw any data we have, and schedule fetching more of it to cover the view
   * @param timestamp    timestamp in milliseconds
   * @param projection   pixi projection to use for rendering
   * @param zoom         effective zoom to use for rendering
   */
  render(timestamp, projection, zoom) {
    const context = this.context;
    const service = this.getService();
    const graph = context.graph();


    if (this._enabled && service && zoom >= MINZOOM) {
      this.visible = true;

      context.loadTiles(context.projection);  // load OSM data that covers the view

      const map = context.map();
      const entities = context.history().intersects(map.extent());

      // Gather data
      let data = { points: [], vertices: [], lines: [], polygons: [] };

      entities.forEach(entity => {
        const geom = entity.geometry(graph);
        if (geom === 'point') {
          data.points.push(entity);
        } else if (geom === 'vertex') {
          data.vertices.push(entity);
        } else if (geom === 'line') {
          data.lines.push(entity);
        } else if (geom === 'area') {
          data.polygons.push(entity);
        }
      });

      // // Gather all child nodes of visible lines
      // data.lines.forEach(line => {
      //   graph.childNodes(line).forEach(node => data.vertices.add(node));
      // });

      this.drawPolygons(timestamp, projection, zoom, data.polygons);
      this.drawLines(timestamp, projection, zoom, data.lines);
      this.drawVertices(timestamp, projection, zoom, data.vertices);
      this.drawPoints(timestamp, projection, zoom, data.points);

      this.cull(timestamp);

    } else {
      this.visible = false;
    }
  }


  /**
   * drawPolygons
   * @param timestamp    timestamp in milliseconds
   * @param projection   a pixi projection
   * @param zoom         the effective zoom to use for rendering
   * @param entities     Array of OSM entities
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
   * @param timestamp    timestamp in milliseconds
   * @param projection   a pixi projection
   * @param zoom         the effective zoom to use for rendering
   * @param entities     Array of OSM entities
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
        levelContainer.interactive = false;
        levelContainer.interactiveChildren = true;
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
      }

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
      }
    });
  }


  /**
   * drawVertices
   * @param timestamp    timestamp in milliseconds
   * @param projection   pixi projection to use for rendering
   * @param zoom         effective zoom to use for rendering
   * @param entities     Array of OSM entities
   */
  drawVertices(timestamp, projection, zoom, entities) {
    const vertexContainer = this.container.getChildByName(`${LAYERID}-vertices`);
    const context = this.context;
    const scene = this.scene;
    const graph = context.graph();

    function isInterestingVertex(entity) {
      return entity.type === 'node' && entity.geometry(graph) === 'vertex' && (
        entity.hasInterestingTags() || entity.isEndpoint(graph) || entity.isIntersection(graph)
      );
    }

    entities.forEach(node => {
      // Skip boring vertices for now..
      // At some point we will want to render them if the line is selected or hovered
      if (!isInterestingVertex(node)) return;

      let feature = scene.get(node.id);

      // Create a new point if this vertex is entering the scene.
      if (!feature) {
        feature = new PixiFeaturePoint(context, node.id, vertexContainer, node, node.loc);
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
          markerStyle.iconAlpha = 0.6;
        }
        if (graph.isShared(node)) {     // shared nodes / junctions are more grey
          markerStyle.markerTint = 0xbbbbbb;
        }

        feature.style = markerStyle;
      }

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
      }
    });
  }


  /**
   * drawPoints
   * @param timestamp    timestamp in milliseconds
   * @param projection   pixi projection to use for rendering
   * @param zoom         effective zoom to use for rendering
   * @param entities     Array of OSM entities
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
          markerStyle.iconAlpha = 0.6;
        }

        feature.style = markerStyle;
      }

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
      }
    });
  }


  /**
   * supported
   * Whether the layer's service exists
   */
  get supported() {
    return !!this.getService();
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
