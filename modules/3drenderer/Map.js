/* eslint-disable */
import { Map as mapLibreMap } from 'maplibre-gl';

export class  Map {
  constructor(id) {

      this.building3dlayerSpec = {
          id: '3D Buildings',
          type: 'fill-extrusion',
          source: 'osmbuildings',
          layout: {},
          paint: {
              'fill-extrusion-color': '#ff26db',

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

      this.map = new mapLibreMap({
        container: id,
        pitch: 30,
        style: 'https://api.maptiler.com/maps/streets-v2/style.json?key=5pbVUaiVhKNAxkLf1kts',
      });

      this.map.on('load', () => {
        this.map.setLight({
            anchor: 'viewport',
            color: '#ff00ff',
            position: [1, 200, 30],
            intensity: 0.3,
        });
        this.map.addSource(
            'osmbuildings', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
            },
        );
        this.map.addLayer(this.building3dlayerSpec);
        this.map.getLayer('building-3d').visibility = 'none';
      });
  }

  // componentDidMount() {




  //   this.map.fitBounds(this.props.bounds);


  // update() {
  //   const buildingSource = this.map.getSource('osmbuildings');
  //   buildingSource.setData(this.props.geojson);
  //   this.map.fitBounds(this.props.bounds);
  // }

  // render() {
  //   return (
  //     <div
  //       style={{ height: 300, width: 300 }}
  //       ref={(elem) => {
  //         this.mapElement = elem;
  //       }}
  //     ></div>
  //   );
  // }
}
