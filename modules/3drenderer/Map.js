import { Map as mapLibreMap } from 'maplibre-gl';
import { STYLES } from '../pixi/styles';
import * as PIXI from 'pixi.js';

export class Map {
  constructor(id, context) {
    this.building3dlayerSpec = this.get3DBuildingLayerSpec('3D Buildings', 'osmbuildings');
    this.roadStrokelayerSpec = this.getRoadStrokeLayerSpec('Roads', 'osmroads');
    this.roadCasinglayerSpec = this.getRoadCasingLayerSpec('Roads', 'osmroads');
    this.roadSelectedlayerSpec = this.getRoadSelectedLayerSpec('Roads', 'osmroads');
    this.areaLayerSpec = this.getAreaLayerSpec('Areas', 'osmareas');

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

      this.map.jumpTo({
        zoom: context.map().zoom() - 3,
        center: context.map().extent().center()
      });

      this.map.addSource('osmareas', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Layers need to be added in 'painter's algorithm' order, so the stuff on the bottom goes first!
      this.map.addLayer(this.areaLayerSpec);

      this.map.addSource('osmroads', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      this.map.addLayer(this.roadSelectedlayerSpec);
      this.map.addLayer(this.roadCasinglayerSpec);
      this.map.addLayer(this.roadStrokelayerSpec);

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
      this.map.getLayer('road_network-casing').visibility = 'none';
    });
  }

  SELECTION_COLOR = '#01d4fa';

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
          this.SELECTION_COLOR,
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
   * get3DBuildingLayerSpec
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
        "fill-color":
          ["get", "fillcolor"],
        "fill-outline-color":
          ["get", "strokecolor"]
      }
    };
  }

              //
            // ["match", ["get", "leisure"], ["swimming_pool"]], PIXI.utils.hex2string(STYLES.blue.fill.color),
            // ["match", ["get", "leisure"], ["track"]], PIXI.utils.hex2string(STYLES.yellow.fill.color)


  /**
   * getRoadCasingLayerSpec
   * Returns a maplibre layer style specification that widens the road casing to be just above the stroke.
   * @param {string} id the id of the layer that the source data shall be applied to
   * @param {string} source the source geojson data that to be rendered
   * @returns the specification object with mapbox styling rules for the 'highway' tag data.
   */
   getRoadCasingLayerSpec(id, source) {
    return {
      "id": id + "-casing",
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
          ["get", "highway"],
           "trunk", PIXI.utils.hex2string(STYLES.trunk.casing.color),
           "primary", PIXI.utils.hex2string(STYLES.primary.casing.color),
           "unclassified", PIXI.utils.hex2string(STYLES.unclassified.casing.color),
           "footway", PIXI.utils.hex2string(STYLES.special_service.casing.color), //Intentional Override- white doesn't show up
           "pedestrian", PIXI.utils.hex2string(STYLES.special_service.casing.color),
           "motorway", PIXI.utils.hex2string(STYLES.motorway.casing.color),
           "secondary", PIXI.utils.hex2string(STYLES.secondary.casing.color),
           "tertiary", PIXI.utils.hex2string(STYLES.tertiary.casing.color),
           "residential", PIXI.utils.hex2string(STYLES.residential.casing.color),
           "living_street", PIXI.utils.hex2string(STYLES.living_street.casing.color),
           "service", PIXI.utils.hex2string(STYLES.service.casing.color),
           "special_service", PIXI.utils.hex2string(STYLES.special_service.casing.color),
           "track", PIXI.utils.hex2string(STYLES.track.casing.color),
           "path", PIXI.utils.hex2string(STYLES.path.casing.color),
           "crossing_marked", PIXI.utils.hex2string(STYLES.crossing_marked.casing.color),
           "crossing_unmarked", PIXI.utils.hex2string(STYLES.crossing_unmarked.casing.color),
           "cycleway", PIXI.utils.hex2string(STYLES.river.stroke.color),
           "bridleway", PIXI.utils.hex2string(STYLES.bridleway.casing.color),
           "corridor", PIXI.utils.hex2string(STYLES.corridor.casing.color),
           "steps", PIXI.utils.hex2string(STYLES.steps.casing.color),
           "hsl(100,70%,100%)"
        ],
        "line-width": this.getLineWidthSpecification(6)
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
        'line-color': this.SELECTION_COLOR,
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
       "id": id + "-stroke",
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
           ["get", "highway"],
            "trunk", PIXI.utils.hex2string(STYLES.trunk.stroke.color),
            "primary", PIXI.utils.hex2string(STYLES.primary.stroke.color),
            "unclassified", PIXI.utils.hex2string(STYLES.unclassified.stroke.color),
            "footway", PIXI.utils.hex2string(STYLES.footway.stroke.color),
            "pedestrian", PIXI.utils.hex2string(STYLES.pedestrian.stroke.color),
            "motorway", PIXI.utils.hex2string(STYLES.motorway.stroke.color),
            "secondary", PIXI.utils.hex2string(STYLES.secondary.stroke.color),
            "tertiary", PIXI.utils.hex2string(STYLES.tertiary.stroke.color),
            "residential", PIXI.utils.hex2string(STYLES.residential.stroke.color),
            "living_street", PIXI.utils.hex2string(STYLES.living_street.stroke.color),
            "service", PIXI.utils.hex2string(STYLES.service.stroke.color),
            "special_service", PIXI.utils.hex2string(STYLES.special_service.stroke.color),
            "track", PIXI.utils.hex2string(STYLES.track.stroke.color),
            "path", PIXI.utils.hex2string(STYLES.path.stroke.color),
            "crossing_marked", PIXI.utils.hex2string(STYLES.crossing_marked.stroke.color),
            "crossing_unmarked", PIXI.utils.hex2string(STYLES.crossing_unmarked.stroke.color),
            "cycleway", PIXI.utils.hex2string(STYLES.cycleway.stroke.color),
            "bridleway", PIXI.utils.hex2string(STYLES.bridleway.stroke.color),
            "corridor", PIXI.utils.hex2string(STYLES.corridor.stroke.color),
            "steps", PIXI.utils.hex2string(STYLES.steps.stroke.color),
            "hsl(100,70%,50%)"
         ],
         "line-opacity": [
          "match",
          ["get", "highway"],
           "trunk", 1,
           "primary", 1,
           "unclassified", 0.8,
           "footway", 1,
           "pedestrian", 1,
           "motorway", 1,
           "secondary", 1,
           "tertiary", 1,
           "residential", 1,
           "living_street", 1,
           "service", 0.2,
           "special_service", 1,
           "track", 1,
           "path", 1,
           "crossing_marked", 1,
           "crossing_unmarked", 1,
           "cycleway", 1,
           "bridleway", 1,
           "corridor", 1,
           "steps", 1,
           1
        ],

         "line-width": this.getLineWidthSpecification(4)
       },
     };
  }


  getLineWidthSpecification(baseWidth) {
    return [
      "interpolate",
      ["linear", 2],
      ["zoom"],
      5,
      0.5,
      16,
      [
        "match",
        ["get", "highway"],
        ["motorway", "trunk", "primary"],
        baseWidth*2,
        ["secondary", "unclassified"],
        Math.floor(.75*baseWidth*2),
        ["tertiary"],
        Math.floor(.75*baseWidth*2) - 1,
        ["minor", "service", "track", "footway", "pedestrian", "cycleway"],
        baseWidth,
        baseWidth
      ],
      20,
      [
        "match",
        ["get", "highway"],
        ["motorway", "trunk", "primary"],
        baseWidth * 2.5,
        ["secondary", "unclassified"],
        baseWidth * 2.5,
        ["tertiary"],
        baseWidth * 2.5,
        ["minor", "service", "track", "footway", "pedestrian", "cycleway"],
        baseWidth*2,
        baseWidth*2,
      ]
    ];
  }
}


