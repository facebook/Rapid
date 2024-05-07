import { select as d3_select } from 'd3-selection';
import { RAD2DEG, numWrap, vecEqual } from '@rapid-sdk/math';

import { AbstractSystem } from './AbstractSystem.js';

const MAPLIBRE_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@3/dist/maplibre-gl.min.js';
const MAPLIBRE_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@3/dist/maplibre-gl.min.css';
const SELECTION_COLOR = '#01d4fa';


/**
 * `Map3dSystem` wraps an instance of MapLibre viewer
 * and maintains the map state and style specification.
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
    this.dependencies = new Set(['urlhash']);
    this.containerID = '3d-buildings';
    this.maplibre = null;

    this._loadPromise = null;
    this._startPromise = null;

    // The 3d Map will stay close to the main map, but with an offset zoom and rotation
    this.zDiff = 3;   // by default, 3dmap will be at main zoom - 3
    this.bDiff = 0;   // by default, 3dmap bearing will match main map bearing

    this.building3dlayerSpec = this.get3dBuildingLayerSpec('3D Buildings', 'osmbuildings');
    this.roadStrokelayerSpec = this.getRoadStrokeLayerSpec('Roads', 'osmroads');
    this.roadCasinglayerSpec = this.getRoadCasingLayerSpec('Roads', 'osmroads');
    this.roadSelectedlayerSpec = this.getRoadSelectedLayerSpec('Roads', 'osmroads');
    this.areaLayerSpec = this.getAreaLayerSpec('Areas', 'osmareas');

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._moved = this._moved.bind(this);
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
    return Promise.resolve();
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    if (this._startPromise) return this._startPromise;

    return this._startPromise = this._loadAssetsAsync()
      .then(() => {
        const maplibregl = window.maplibregl;
        if (!maplibregl) throw new Error('maplibre-gl not loaded');

        const maplibre = this.maplibre = new maplibregl.Map({
          container: this.containerID,
          pitch: 60,
          scrollZoom: { around: 'center' },
          style: {
            version: 8, sources: {}, layers: [
              {
                'id': 'Background',
                'type': 'background',
                'layout': {
                  'visibility': 'visible'
                },
                'paint': {
                  'background-color': 'white'
                }
              }
          ]}
        });

        maplibre.on('move', this._moved);
        maplibre.on('moveend', this._moved);

        // Add zoom and rotation controls to the map.
        const navOptions = {
          showCompass: true,
          showZoom: true,
          visualizePitch: false
        };
        maplibre.addControl(new maplibregl.NavigationControl(navOptions));

        return new Promise(resolve => {

          maplibre.on('load', () => {
            maplibre.setLight({
              anchor: 'viewport',
              color: '#ff00ff',
              position: [1, 200, 30],
              intensity: 0.3,
            });

            // sources
            maplibre.addSource('osmareas', {
              type: 'geojson',
              data: { type: 'FeatureCollection', features: [] },
            });

            maplibre.addSource('osmroads', {
              type: 'geojson',
              data: { type: 'FeatureCollection', features: [] },
            });

            maplibre.addSource('osmbuildings', {
              type: 'geojson',
              data: { type: 'FeatureCollection', features: [] },
            });

            // Layers need to be added in 'painter's algorithm' order, so the stuff on the bottom goes first!
            maplibre.addLayer(this.areaLayerSpec);
            maplibre.addLayer(this.roadSelectedlayerSpec);
            maplibre.addLayer(this.roadCasinglayerSpec);
            maplibre.addLayer(this.roadStrokelayerSpec);
            maplibre.addLayer(this.building3dlayerSpec);

            this._started = true;
            resolve();
          });
        });
      })
      .catch(err => {
        if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
        this._startPromise = null;
      });
  }


  /**
   * _moved
   * Respond to changes in the maplibre viewer
   */
  _moved() {
    const context = this.context;
    const map = context.systems.map;
    const maplibre = this.maplibre;
    const viewport = context.viewport;
    const transform = viewport.transform;

    if (!maplibre) return;  // called too early?

    const mlCenter = maplibre.getCenter();
    const mlCenterLoc = [mlCenter.lng, mlCenter.lat];
    const mlZoom = maplibre.getZoom();
    const mlBearing = maplibre.getBearing();

    const mainCenterLoc = viewport.centerLoc();
    const mainZoom = transform.zoom;
    // Why a '-' here?  Because "bearing" is the angle that the user points, not the angle that north points.
    const mainBearing = numWrap(-transform.rotation * RAD2DEG, 0, 360);

    this.zDiff = mainZoom - mlZoom;
    this.bDiff = mainBearing - mlBearing;

    // Recenter main map, if 3dmap center moved
    if (!vecEqual(mainCenterLoc, mlCenterLoc, 1e-6)) {
      map.center(mlCenterLoc);
    }
  }


  /**
   * _loadAssetsAsync
   * Load the MapLibre JS and CSS files into the document head
   * @return {Promise} Promise resolved when both files have been loaded
   */
  _loadAssetsAsync() {
    if (this._loadPromise) return this._loadPromise;

    return this._loadPromise = new Promise((resolve, reject) => {
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
        .attr('href', MAPLIBRE_CSS)
        .on('load', loaded)
        .on('error', reject);

      head.selectAll('#rapideditor-maplibre-js')
        .data([0])
        .enter()
        .append('script')
        .attr('id', 'rapideditor-maplibre-js')
        .attr('crossorigin', 'anonymous')
        .attr('src', MAPLIBRE_JS)
        .on('load', loaded)
        .on('error', reject);
    });
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    return Promise.resolve();
  }


  /**
   * get3dBuildingLayerSpec
   * Returns a maplibre layer style specification that appropriately styles 3D buildings
   * using data-driven styling for selected features. Features with no height data are drawn as flat
   * polygons.
   * @param {string} id the id of the layer that the source data shall be applied to
   * @param {string} source the source geojson data that to be rendered
   * @returns
   */
  get3dBuildingLayerSpec(id, source) {
    return {
      id: id,
      type: 'fill-extrusion',
      source: source,
      layout: {},
      paint: {
        'fill-extrusion-color': [
          'match',
          ['get', 'selected'],
          'true',
          SELECTION_COLOR,
          /* Regular building 'red' color */ '#e06e5f',
        ],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': ['get', 'min_height'],
        'fill-extrusion-opacity': 0.85,
      },
    };
  }

  /**
   * get3dBuildingLayerSpec
   * Returns a maplibre layer style specification that appropriately styles 3D buildings
   * using data-driven styling for selected features. Features with no height data are drawn as flat
   * polygons.
   * @param {string} id the id of the layer that the source data shall be applied to
   * @param {string} source the source geojson data that to be rendered
   * @returns
   */
  getAreaLayerSpec(id, source) {
    return {
      id: id,
      type: 'fill',
      source: source,
      layout: {},
      paint: {
        'fill-color': ['get', 'fillcolor'],
        'fill-outline-color': ['get', 'strokecolor'],
        'fill-opacity': 0.5
      },
    };
  }

  /**
   * getRoadCasingLayerSpec
   * Returns a maplibre layer style specification that widens the road casing to be just above the stroke.
   * @param {string} id the id of the layer that the source data shall be applied to
   * @param {string} source the source geojson data that to be rendered
   * @returns the specification object with mapbox styling rules for the 'highway' tag data.
   */
  getRoadCasingLayerSpec(id, source) {
    return {
      id: id + '-casing',
      type: 'line',
      source: source,
      minzoom: 4,
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
      paint: {
        'line-color': ['get', 'casingColor'],
        'line-width': this.getLineWidthSpecification(6),
      },
    };
  }

  /**
   * getRoadSelectedLayerSpec
   * Returns a maplibre layer style specification that appropriately styles a wide extra casing around any selected roads.
   * Also uses the same 'selected' color as the building layer.
   * @param {string} id the id of the layer that the source data shall be applied to
   * @param {string} source the source geojson data that to be rendered
   * @returns
   */
  getRoadSelectedLayerSpec(id, source) {
    return {
      id: id + '-selected',
      type: 'line',
      source: source,
      minzoom: 4,
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
      },
      paint: {
        'line-color': SELECTION_COLOR,
        'line-opacity': ['match', ['get', 'selected'], 'true', 0.75, 0],
        'line-width': this.getLineWidthSpecification(12),
      },
    };
  }

  /**
   * getRoadStrokeLayerSpec
   * Returns a maplibre layer style specification that appropriately styles the road stroke to be just thinner than the casing.
   * Also uses the same stroke color as the main OSM styling.
   * @param {string} id the id of the layer that the source data shall be applied to
   * @param {string} source the source geojson data that to be rendered
   * @returns
   * @returns
   */
  getRoadStrokeLayerSpec(id, source) {
    return {
      id: id + '-stroke',
      type: 'line',
      source: source,
      minzoom: 4,
      layout: {
        'line-cap': 'butt',
        'line-join': 'round',
        visibility: 'visible',
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
          1,
        ],
        'line-width': this.getLineWidthSpecification(4),
      },
    };
  }

  getLineWidthSpecification(baseWidth) {
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
