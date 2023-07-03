import { Map as MapLibre } from 'maplibre-gl';

import { AbstractSystem } from './AbstractSystem';

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
    this.dependencies = new Set(['map']);
    this.containerID = '3d-buildings';
    this.maplibre = null;

    this._startPromise = null;

    this.building3dlayerSpec = this.get3dBuildingLayerSpec('3D Buildings', 'osmbuildings');
    this.roadStrokelayerSpec = this.getRoadStrokeLayerSpec('Roads', 'osmroads');
    this.roadCasinglayerSpec = this.getRoadCasingLayerSpec('Roads', 'osmroads');
    this.roadSelectedlayerSpec = this.getRoadSelectedLayerSpec('Roads', 'osmroads');
    this.areaLayerSpec = this.getAreaLayerSpec('Areas', 'osmareas');
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

    this.maplibre = new MapLibre({
      container: this.containerID,
      pitch: 30,
      style: 'https://api.maptiler.com/maps/streets-v2/style.json?key=5pbVUaiVhKNAxkLf1kts'
    });

    return this._startPromise = new Promise(resolve => {

      this.maplibre.on('load', () => {
        this.maplibre.setLight({
          anchor: 'viewport',
          color: '#ff00ff',
          position: [1, 200, 30],
          intensity: 0.3,
        });

        this.maplibre.jumpTo({
          zoom: this.context.systems.map.zoom() - 3,
          center: this.context.systems.map.extent().center(),
        });

        this.maplibre.addSource('osmareas', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        // Layers need to be added in 'painter's algorithm' order, so the stuff on the bottom goes first!
        this.maplibre.addLayer(this.areaLayerSpec);

        this.maplibre.addSource('osmroads', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        this.maplibre.addLayer(this.roadSelectedlayerSpec);
        this.maplibre.addLayer(this.roadCasinglayerSpec);
        this.maplibre.addLayer(this.roadStrokelayerSpec);

        this.maplibre.addSource('osmbuildings', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        this.maplibre.addLayer(this.building3dlayerSpec);

        // Turn off the existing 3d building data and road data that ships with the vector tile-
        // we don't want to have that data competing with the custom data layer we want to render.
        // Drawing both is bad!
        this.maplibre.getLayer('building-3d').visibility = 'none';
        this.maplibre.getLayer('road_network').visibility = 'none';
        this.maplibre.getLayer('road_network-casing').visibility = 'none';

        this._started = true;
        resolve();
      });

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
          /* other */ '#ff26db',
        ],

        // use an 'interpolate' expression to add a smooth transition effect to the
        // buildings as the user zooms in
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          15,
          0,
          15.05,
          ['get', 'height'],
        ],
        'fill-extrusion-base': [
          'interpolate',
          ['linear'],
          ['zoom'],
          15,
          0,
          15.05,
          ['get', 'min_height'],
        ],
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
