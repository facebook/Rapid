import { Map as mapLibreMap } from 'maplibre-gl';

export class Map {
  constructor(id) {
    this.building3dlayerSpec = this.get3DBuildingLayerSpec('3D Buildings', '#ff26db', 'osmbuildings');
    this.building3dSelectedLayerSpec = this.get3DBuildingLayerSpec('Selected 3D Buildings','#01d4fa', 'osmselectedbuildings');

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
      this.map.addSource('osmbuildings', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      this.map.addSource('osmselectedbuildings', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      this.map.addLayer(this.building3dlayerSpec);
      this.map.addLayer(this.building3dSelectedLayerSpec);

      //Turn off the existing 3d building data that ships with the vector tile- we don't want to
      // have that data competing with the custom data layer we want to render. Drawing both is bad!
      this.map.getLayer('building-3d').visibility = 'none';
    });
  }

  /**
   * et3DBuildingLayerSpec
   * Returns a maplibre layer style specification that appropriately
   * @param {string} color a CSS hex color with leading '#', like '#ff26db'
   * @returns
   */
  get3DBuildingLayerSpec(id, color, source) {
    return {
      id: id,
      type: 'fill-extrusion',
      source: source,
      layout: {},
      paint: {
        'fill-extrusion-color': color,

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
}
