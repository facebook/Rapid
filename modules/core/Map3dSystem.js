import { select as d3_select } from 'd3-selection';
import { RAD2DEG, numWrap, geomPolygonContainsPolygon, vecEqual } from '@rapid-sdk/math';
import { Color } from 'pixi.js';
import throttle from 'lodash-es/throttle.js';

import { AbstractSystem } from './AbstractSystem.js';
import { uiCmd } from '../ui/cmd.js';

const SELECTION_COLOR = '#01d4fa';


/**
 * `Map3dSystem` wraps an instance of MapLibre viewer
 *  and maintains the map state and style specification.
 */
export class Map3dSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'map3d';
    this.autoStart = false;
    this.dependencies = new Set(['editor', 'l10n', 'map', 'styles', 'ui', 'urlhash']);
    this.maplibre = null;
    this.containerID = 'map3d_container';

    this._loadPromise = null;
    this._initPromise = null;
    this._startPromise = null;

    // The 3d Map will stay close to the main map, but with an offset zoom and rotation
    this._zDiff = 3;     // by default, 3dmap will be at main zoom - 3
    this._bDiff = 0;     // by default, 3dmap bearing will match main map bearing
    this._lastv = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._hashchange = this._hashchange.bind(this);
    this._map3dmoved = this._map3dmoved.bind(this);
    this.redraw = this.redraw.bind(this);
    this.deferredRedraw = throttle(this.redraw, 50, { leading: true, trailing: true });
    this.toggle = this.toggle.bind(this);

    this._getAreaLayer = this._getAreaLayer.bind(this);
    this._getBuildingLayer = this._getBuildingLayer.bind(this);
    this._getRoadStrokeLayer = this._getRoadStrokeLayer.bind(this);
    this._getRoadCasingLayer = this._getRoadCasingLayer.bind(this);
    this._getRoadSelectedLayer = this._getRoadSelectedLayer.bind(this);
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    for (const id of this.dependencies) {
      if (!this.context.systems[id]) {
        return Promise.reject(`Cannot init:  ${this.id} requires ${id}`);
      }
    }

    const context = this.context;
    const l10n = context.systems.l10n;
    const urlhash = context.systems.urlhash;

    const prerequisites = Promise.all([
      l10n.initAsync(),
      urlhash.initAsync()
    ]);

    return this._initPromise = prerequisites
      .then(() => {
        urlhash.on('hashchange', this._hashchange);

        const toggleKey = uiCmd('⌘' + l10n.t('background.3dmap.key'));
        context.keybinding().off(toggleKey);
        context.keybinding().on(toggleKey, this.toggle);
      });
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    if (this._startPromise) return this._startPromise;

    const context = this.context;
    const map = context.systems.map;
    const ui = context.systems.ui;

    map.on('draw', this.deferredRedraw);  // respond to changes in the main map
    map.on('move', this.deferredRedraw);

    const prerequisites = Promise.all([
      ui.startAsync(),    // wait for UI to be started, so the container will exist
      this._loadMapLibreAsync()
    ]);

    return this._startPromise = prerequisites
      .then(() => {
        const maplibregl = window.maplibregl;
        if (!maplibregl) throw new Error('maplibre-gl not loaded');

        const maplibre = this.maplibre = new maplibregl.Map({
          container: this.containerID,
          minZoom: 12,
          pitch: 60,
          scrollZoom: { around: 'center' },
          style: {
            version: 8,
            sources: {},
            layers: [{
              id: 'background-layer',
              type: 'background',
              layout: { 'visibility': 'visible' },
              paint: { 'background-color': 'white' }
            }]
          }
          });

        maplibre.on('move', this._map3dmoved);   // respond to changes in the 3d map
        maplibre.on('moveend', this._map3dmoved);

        // Add zoom and rotation controls to the map.
        const navOptions = { showCompass: true, showZoom: true, visualizePitch: false };
        maplibre.addControl(new maplibregl.NavigationControl(navOptions));

        return new Promise(resolve => {
          maplibre.on('load', () => {
            maplibre.setLight({
              anchor: 'viewport',
              color: '#ff00ff',
              position: [1, 200, 30],
              intensity: 0.3,
            });

            // Setup Sources.. Empty for now, we will fill them in later
            const EMPTY = { type: 'FeatureCollection', features: [] };
            maplibre.addSource('osmareas', { type: 'geojson', data: EMPTY });
            maplibre.addSource('osmroads', { type: 'geojson', data: EMPTY });
            maplibre.addSource('osmbuildings', {type: 'geojson', data: EMPTY });

            // Layers need to be added in 'painter's algorithm' order, so the stuff on the bottom goes first!
            maplibre.addLayer(this._getAreaLayer());
            maplibre.addLayer(this._getRoadSelectedLayer());
            maplibre.addLayer(this._getRoadCasingLayer());
            maplibre.addLayer(this._getRoadStrokeLayer());
            maplibre.addLayer(this._getBuildingLayer());

            this._started = true;
            this.redraw();
            resolve();
          });
        });
      })
      .catch(err => {
        if (err instanceof Error) console.error(err); // eslint-disable-line no-console
        this._startPromise = null;
      });
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    this.deferredRedraw.cancel();
    return Promise.resolve();
  }


  /**
   * visible
   * For now, just store this state in the url hash
   * set/get whether the 3d viewer is visible
   */
  get visible() {
    const urlhash = this.context.systems.urlhash;
    return !!urlhash.getParam('map3d');
  }

  set visible(val) {
    const context = this.context;
    const urlhash = context.systems.urlhash;
    const isVisible = this.visible;

    if (val) {   // show it
      urlhash.setParam('map3d', 'true');

      this.startAsync()  // start it up, if we haven't already
        .then(() => {
          context.container().select(`#${this.containerID}`)
            .style('display', 'block')
            .style('opacity', '0')
            .transition()
            .duration(200)
            .style('opacity', '1');
        });

    } else {   // hide it
      urlhash.setParam('map3d', null);

      // Expect the MapLibre container to exist already, it's created by `map3d_viewer.js`
      // If it doesn't exist, this will return a null selection, and that's ok too.
      const mlcontainer = context.container().select(`#${this.containerID}`);
      mlcontainer
        .transition()
        .duration(200)
        .style('opacity', '0')
        .on('end', () => mlcontainer.style('display', 'none'));
    }
  }


  /**
   * toggle
   * If visible, make invisible.  If invisible, make visible.
   */
  toggle() {
    this.visible = !this.visible;
  }


  /**
   * _loadMapLibreAsync
   * Load the MapLibre JS and CSS files into the document head
   * @return {Promise} Promise resolved when both files have been loaded
   */
  _loadMapLibreAsync() {
    if (this._loadPromise) return this._loadPromise;

    return this._loadPromise = new Promise((resolve, reject) => {
      const assets = this.context.systems.assets;

      let count = 0;
      const loaded = () => {
        if (++count === 2) resolve();
      };

      const head = d3_select('head');

      head.selectAll('#rapideditor-maplibre-css')
        .data([0])
        .enter()
        .append('link')
        .attr('id', 'rapideditor-maplibre-css')
        .attr('rel', 'stylesheet')
        .attr('crossorigin', 'anonymous')
        .attr('href', assets.getAssetURL('maplibre_css'))
        .on('load', loaded)
        .on('error', reject);

      head.selectAll('#rapideditor-maplibre-js')
        .data([0])
        .enter()
        .append('script')
        .attr('id', 'rapideditor-maplibre-js')
        .attr('crossorigin', 'anonymous')
        .attr('src', assets.getAssetURL('maplibre_js'))
        .on('load', loaded)
        .on('error', reject);
    });
  }


  /**
   * redraw
   * Redraw the 3d map
   */
  redraw() {
    if (!this.visible) return;
    this.updateViewport();
    this.updateData();
  }


  /**
   * updateViewport
   * Adjust the 3d map to follow the main map, applying any zoom and rotation offsets.
   */
  updateViewport() {
    const context = this.context;
    const maplibre = this.maplibre;
    const viewport = context.viewport;
    const transform = viewport.transform;

    if (!this.visible) return;
    if (!maplibre) return;                   // called too early?
    if (maplibre.isMoving()) return;         // already moving for other reasons (user interaction?)
    if (viewport.v === this._lastv) return;  // main map view hasn't changed
    this._lastv = viewport.v;

    // Why a '-' here?  Because "bearing" is the angle that the user points, not the angle that north points.
    const bearing = numWrap(-transform.r * RAD2DEG, 0, 360);

    maplibre.jumpTo({
      center: viewport.centerLoc(),
      bearing: bearing - this._bDiff,
      zoom: transform.zoom - this._zDiff
    });
  }


  /**
   * _hashchange
   * Respond to any changes appearing in the url hash
   * @param  currParams   Map(key -> value) of the current hash parameters
   * @param  prevParams   Map(key -> value) of the previous hash parameters
   */
  _hashchange(currParams, prevParams) {
    // map3d
    const newMap3d = currParams.get('map3d');
    const oldMap3d = prevParams.get('map3d');
    if (!newMap3d || newMap3d !== oldMap3d) {
      // eventually, support a proper hash param?
      if (newMap3d === 'true') {
        this.visible = true;
      } else {
        this.visible = false;
      }

    }
  }


  /**
   * _map3dmoved
   * Respond to changes in the 3d map, for example if the user interacts with it.
   * Update zoom and bearing offsets from main map, and recenter the main map if needed.
   */
  _map3dmoved() {
    const context = this.context;
    const maplibre = this.maplibre;
    const map = context.systems.map;
    const viewport = context.viewport;
    const transform = viewport.transform;

    if (!maplibre) return;      // called too early?
    if (!this._lastv) return;   // haven't positioned the map yet (it may be at null island), Rapid#1441

    const mlCenter = maplibre.getCenter();
    const mlCenterLoc = [mlCenter.lng, mlCenter.lat];
    const mlZoom = maplibre.getZoom();
    const mlBearing = maplibre.getBearing();

    const mainCenterLoc = viewport.centerLoc();
    const mainZoom = transform.zoom;
    // Why a '-' here?  Because "bearing" is the angle that the user points, not the angle that north points.
    const mainBearing = numWrap(-transform.rotation * RAD2DEG, 0, 360);

    this._zDiff = mainZoom - mlZoom;
    this._bDiff = mainBearing - mlBearing;

    // Recenter main map, if 3dmap center moved
    if (!vecEqual(mainCenterLoc, mlCenterLoc, 1e-6)) {
      map.center(mlCenterLoc);
    }
  }


  /**
   * updateData
   * Collect features in view, filter them according to what we want to show,
   * then update the data in the 3d map.
   */
  updateData() {
    if (!this.visible) return;
    if (!this.maplibre) return;   // called too soon?

    const context = this.context;
    const editor = context.systems.editor;
    const viewport = context.viewport;

    const entities = editor.intersects(viewport.visibleExtent());
    const noRelationEnts = entities.filter(entity => !entity.id.startsWith('r'));

    const highways = noRelationEnts.filter(entity => {
      const tags = Object.keys(entity.tags).filter(tagname => tagname.startsWith('highway'));
      return tags.length > 0;
    });

    const buildings = noRelationEnts.filter(entity => {
      const tags = Object.keys(entity.tags).filter(tagname => tagname.startsWith('building'));
      return tags.length > 0;
    });

    const areas = noRelationEnts.filter(entity => {
      const tags = Object.keys(entity.tags).filter(tagname =>
        tagname.startsWith('landuse') ||
        tagname.startsWith('leisure') ||
        tagname.startsWith('natural') ||
        tagname.startsWith('area')
      );
      return tags.length > 0;
    });

    this._updateRoadData(highways);
    this._updateBuildingData(buildings);
    this._updateAreaData(areas);
  }


  /**
   * _updateBuildingData
   */
  _updateBuildingData(entities) {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const selectedIDs = context.selectedIDs();

    let buildingFeatures = [];
    for (const entity of entities) {
      const gj = entity.asGeoJSON(graph);
      if (gj.type !== 'Polygon' && gj.type !== 'MultiPolygon') continue;

      // If the building isn't a 'part', check its nodes.
      // If any of THEM have a 'building part' as a way, and if that part is
      // wholly contained in the footprint of this building, then we need to
      // hide this building.
      // Only perform this step if there are relatively few buildings to show,
      // as this is a very expensive algorithm to run
      if (!entity.tags['building:part'] && entities.length < 250) {
        let touchesBuildingPart = false;

        for (let node of entity.nodes) {
          const parents = graph.parentWays(graph.hasEntity(node));
          for (let way of parents) {
            if (way.tags['building:part'] && geomPolygonContainsPolygon(entity.nodes.map(n => graph.hasEntity(n).loc), way.nodes.map(n => graph.hasEntity(n).loc))) {
              touchesBuildingPart = true;
              break;
            }
          }
        }

        if (touchesBuildingPart) {
          continue;
        }
      }

      const newFeature = {
        type: 'Feature',
        properties: {
          extrude: true,
          selected: selectedIDs.includes(entity.id).toString(),
          min_height: entity.tags.min_height ? parseFloat(entity.tags.min_height) : 0,
          height: parseFloat(entity.tags.height || entity.tags['building:levels'] * 3 || 0)
        },
        geometry: gj
      };

      buildingFeatures.push(newFeature);
    }

    const buildingSource = this.maplibre.getSource('osmbuildings');
    if (buildingSource) {
      buildingSource.setData({
        type: 'FeatureCollection',
        features: buildingFeatures
      });
    }
  }


  /**
   * _updateAreaData
   */
  _updateAreaData(entities) {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const styles = context.systems.styles;
    const selectedIDs = context.selectedIDs();

    let areaFeatures = [];
    for (const entity of entities) {
      let gj = entity.asGeoJSON(graph);
      if (gj.type !== 'Polygon' && gj.type !== 'MultiPolygon') continue;

      const style = styles.styleMatch(entity.tags);
      const fillColor = new Color(style.fill.color).toHex();
      const strokeColor = new Color(style.stroke.color).toHex();

      const newFeature = {
        type: 'Feature',
        properties: {
          selected: selectedIDs.includes(entity.id).toString(),
          fillcolor: fillColor,
          strokecolor: strokeColor
        },
        geometry: gj
      };

      areaFeatures.push(newFeature);
    }

    const areaSource = this.maplibre.getSource('osmareas');
    if (areaSource) {
      areaSource.setData({
        type: 'FeatureCollection',
        features: areaFeatures
      });
    }
  }


  /**
   * _updateRoadData
   */
  _updateRoadData(entities) {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const styles = context.systems.styles;
    const selectedIDs = context.selectedIDs();

    let roadFeatures = [];
    for (const entity of entities) {
      const gj = entity.asGeoJSON(graph);
      if (gj.type !== 'LineString') continue;

      const style = styles.styleMatch(entity.tags);
      const casingColor = new Color(style.casing.color).toHex();
      const strokeColor = new Color(style.stroke.color).toHex();

      const newFeature = {
        type: 'Feature',
        properties: {
          selected: selectedIDs.includes(entity.id).toString(),
          highway: entity.tags.highway,
          casingColor: casingColor,
          strokeColor: strokeColor
        },
        geometry: gj
      };

      roadFeatures.push(newFeature);
    }

    const roadSource = this.maplibre.getSource('osmroads');
    if (roadSource) {
      roadSource.setData({
        type: 'FeatureCollection',
        features: roadFeatures
      });
    }
  }


  /**
   * _getBuildingLayer
   * Returns a maplibre layer style specification that appropriately styles 3D buildings using
   * data-driven styling for selected features. Features with no height data are drawn as flat polygons.
   * @returns {Object}
   */
  _getBuildingLayer() {
    return {
      id: 'building-layer',
      type: 'fill-extrusion',
      source: 'osmbuildings',
      layout: {},
      paint: {
        'fill-extrusion-color': [
          'match',
          ['get', 'selected'],
          'true',
          SELECTION_COLOR,
          '#e06e5f'   /* Regular building 'red' color */
        ],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': ['get', 'min_height'],
        'fill-extrusion-opacity': 0.85
      }
    };
  }


  /**
   * _getAreaLayer
   * Returns a maplibre layer style specification that appropriately styles areas.
   * @returns {Object}
   */
  _getAreaLayer() {
    return {
      id: 'area-layer',
      type: 'fill',
      source: 'osmareas',
      layout: {},
      paint: {
        'fill-color': ['get', 'fillcolor'],
        'fill-outline-color': ['get', 'strokecolor'],
        'fill-opacity': 0.5
      }
    };
  }


  /**
   * _getRoadCasingLayer
   * Returns a maplibre layer style specification that widens the road casing to be just above the stroke.
   * @returns {Object}
   */
  _getRoadCasingLayer() {
    return {
      id: 'road-casing-layer',
      type: 'line',
      source: 'osmroads',
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible'
      },
      paint: {
        'line-color': ['get', 'casingColor'],
        'line-width': this._getLineWidth(6)
      }
    };
  }


  /**
   * _getRoadSelectedLayer
   * Returns a maplibre layer style specification that appropriately styles a wide extra casing around any selected roads.
   * Also uses the same 'selected' color as the building layer.
   * @returns {Object}
   */
  _getRoadSelectedLayer() {
    return {
      id: 'road-selected-layer',
      type: 'line',
      source: 'osmroads',
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible'
      },
      paint: {
        'line-color': SELECTION_COLOR,
        'line-opacity': ['match', ['get', 'selected'], 'true', 0.75, 0],
        'line-width': this._getLineWidth(12)
      }
    };
  }


  /**
   * _getRoadStrokeLayer
   * Returns a maplibre layer style specification that appropriately styles the road stroke to be just thinner than the casing.
   * Also uses the same stroke color as the main OSM styling.
   * @returns {Object}
   */
  _getRoadStrokeLayer() {
    return {
      id: 'road-stroke-layer',
      type: 'line',
      source: 'osmroads',
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible'
      },
      paint: {
        'line-color': ['get', 'strokeColor'],
        'line-opacity': [
          'match',
          ['get', 'highway'],
          'unclassified',
          0.8,
          'service',
          0.2,
          1
        ],
        'line-width': this._getLineWidth(4)
      }
    };
  }


  /**
   * _getLineWidth
   * Returns a line width interpolator, to scale the line width based on zoom.
   * @param   {number} baseWidth - the base width in pixels
   * @returns {Object}
   */
  _getLineWidth(baseWidth) {
    return [
      'interpolate',
      ['linear', 2],
      ['zoom'],
      5,
      0.5,
      16,
      [
        'match',
        ['get', 'highway'],
        ['motorway', 'trunk', 'primary'],
        baseWidth * 2,
        ['secondary', 'unclassified'],
        Math.floor(0.75 * baseWidth * 2),
        ['tertiary'],
        Math.floor(0.75 * baseWidth * 2) - 1,
        ['minor', 'service', 'track', 'footway', 'pedestrian', 'cycleway'],
        baseWidth,
        baseWidth,
      ],
      20,
      [
        'match',
        ['get', 'highway'],
        ['motorway', 'trunk', 'primary'],
        baseWidth * 2.5,
        ['secondary', 'unclassified'],
        baseWidth * 2.5,
        ['tertiary'],
        baseWidth * 2.5,
        ['minor', 'service', 'track', 'footway', 'pedestrian', 'cycleway'],
        baseWidth * 2,
        baseWidth * 2,
      ],
    ];
  }

}
