import { Map as mapLibreMap } from 'maplibre-gl';
import { STYLES } from '../pixi/styles';
import * as PIXI from 'pixi.js';

export class Map {
  constructor(id) {
    this.building3dlayerSpec = this.get3DBuildingLayerSpec('3D Buildings', 'osmbuildings');
    this.roadlayerSpec = this.getRoadLayerSpec('Roads', 'osmroads');

    this.map = new mapLibreMap({
      container: id,
      pitch: 30,
      style:
        'https://api.maptiler.com/maps/streets-v2/style.json?key=5pbVUaiVhKNAxkLf1kts',
    });

    this.map.on('load', () => {
      this.map.setLight({
        anchor: 'viewport',
        color: '#ff00ff',
        position: [1, 200, 30],
        intensity: 0.3,
      });

      this.map.addSource('osmroads', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      this.map.addLayer(this.roadlayerSpec);

      this.map.addSource('osmbuildings', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      this.map.addLayer(this.building3dlayerSpec);


      //Turn off the existing 3d building data and road data that ships with the vector tile-
      // we don't want to have that data competing with the custom data layer we want to render.
      // Drawing both is bad!
      this.map.getLayer('building-3d').visibility = 'none';
      this.map.getLayer('road_network').visibility = 'none';
    });
  }

  /**
   * get3DBuildingLayerSpec
   * Returns a maplibre layer style specification that appropriately styles 3D buildings
   * using data-driven styling for selected features. Features with no height data are drawn as flat
   * polygons.
   * @param {string} id the id of the layer that the source data shall be applied to
   * @param {string} source the source geojson data that to be rendered
   * @returns
   */
  get3DBuildingLayerSpec(id, source) {
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
          '#01d4fa',
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
   * getRoadLayerSpec
   * Returns a maplibre layer style specification that appropriately
   * @param {string} id the id of the layer that the source data shall be applied to
   * @param {string} source the source geojson data that to be rendered
   * @returns
   * @returns
   */
   getRoadLayerSpec(id, source) {
     return {
       "id": id,
       "type": "line",
       "source": source,
       "minzoom": 4,
       "layout": {
         "line-cap": "butt",
         "line-join": "round",
         "visibility": "visible"
       },
       "paint": {
         "line-color": [
           "match",
           ["get", "motorway"],
             "trunk", PIXI.utils.hex2string(STYLES.trunk.stroke.color),
             "primary", PIXI.utils.hex2string(STYLES.primary.stroke.color),
             "unclassified", PIXI.utils.hex2string(STYLES.unclassified.stroke.color),
             "footway", PIXI.utils.hex2string(STYLES.footway.stroke.color),
             "pedestrian", PIXI.utils.hex2string(STYLES.pedestrian.stroke.color),
          //  ["match", ["get", "highway"], ["motorway"], STYLES.motorway],
          //  ["match", ["get", "highway"], ["primary"], STYLES.primary],
          //  ["match", ["get", "highway"], ["secondary"], STYLES.secondary],
          //  ["match", ["get", "highway"], ["tertiary"], STYLES.tertiary],
          //  ["match", ["get", "highway"], ["unclassified"], STYLES.unclassified],
          //  ["match", ["get", "highway"], ["residential"], STYLES.residential],
          //  ["match", ["get", "highway"], ["living_street"], STYLES.living_street],
          //  ["match", ["get", "highway"], ["service"], STYLES.service],
          //  ["match", ["get", "highway"], ["special_service"], STYLES.special_service],
          //  ["match", ["get", "highway"], ["track"], STYLES.track],
          //  ["match", ["get", "highway"], ["pedestrian"], STYLES.pedestrian],
          //  ["match", ["get", "highway"], ["path"], STYLES.path],
          //  ["match", ["get", "highway"], ["footway"], STYLES.footway],
          //  ["match", ["get", "highway"], ["crossing_marked"], STYLES.crossing_marked],
          //  ["match", ["get", "highway"], ["crossing_unmarked"], STYLES.crossing_unmarked],
          //  ["match", ["get", "highway"], ["cycleway"], STYLES.cycleway],
          //  ["match", ["get", "highway"], ["bridleway"], STYLES.bridleway],
          //  ["match", ["get", "highway"], ["corridor"], STYLES.corridor],
          //  ["match", ["get", "highway"], ["steps"], STYLES.steps],
            "hsl(100,70%,60%)"
         ],
         "line-width": [
           "interpolate",
           ["linear", 2],
           ["zoom"],
           5,
           0.5,
           6,
           [
             "match",
             ["get", "class"],
             ["motorway"],
             ["match", ["get", "brunnel"], ["bridge"], 0, 1],
             ["trunk", "primary"],
             0,
             0
           ],
           10,
           [
             "match",
             ["get", "class"],
             ["motorway"],
             ["match", ["get", "ramp"], 1, 0, 2.5],
             ["trunk", "primary"],
             1.5,
             1
           ],
           12,
           [
             "match",
             ["get", "class"],
             ["motorway"],
             ["match", ["get", "ramp"], 1, 1, 4],
             ["trunk"],
             2.5,
             ["primary"],
             2.5,
             ["secondary", "tertiary"],
             1.5,
             ["minor", "service", "track"],
             1,
             1
           ],
           14,
           [
             "match",
             ["get", "class"],
             ["motorway"],
             ["match", ["get", "ramp"], 1, 5, 6],
             ["trunk"],
             3,
             ["primary"],
             5,
             ["secondary"],
             4,
             ["tertiary"],
             3,
             ["minor", "service", "track"],
             2,
             2
           ],
           16,
           [
             "match",
             ["get", "class"],
             ["motorway", "trunk", "primary"],
             8,
             ["secondary"],
             7,
             ["tertiary"],
             6,
             ["minor", "service", "track"],
             4,
             4
           ],
           20,
           [
             "match",
             ["get", "class"],
             ["motorway", "trunk", "primary"],
             24,
             ["secondary"],
             24,
             ["tertiary"],
             24,
             ["minor", "service", "track"],
             16,
             16
           ]
         ]
       },
       "metadata": {},
       "filter": [
         "all",
         ["!=", "brunnel", "tunnel"],
         [
           "!in",
           "class",
           "ferry",
           "rail",
           "transit",
           "pier",
           "bridge",
           "path",
           "aerialway",
           "motorway_construction",
           "trunk_construction",
           "primary_construction",
           "secondary_construction",
           "tertiary_construction",
           "minor_construction",
           "service_construction",
           "track_construction"
         ]
       ]
     };
  }
}
