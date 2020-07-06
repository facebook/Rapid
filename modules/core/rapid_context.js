import { geoExtent } from '../geo';
import { t } from '../util/locale';
import toGeoJSON from '@mapbox/togeojson';


export function coreRapidContext() {
  const RAPID_MAGENTA = '#ff26d4';

  let _rapidContext = {};
  _rapidContext.version = '1.0.1';

  /* Task extents */
  let _taskExtent;
  _rapidContext.setTaskExtentByGpxData = function(gpxData) {
    const dom = (new DOMParser()).parseFromString(gpxData, 'text/xml');
    const gj = toGeoJSON.gpx(dom);
    if (gj.type === 'FeatureCollection') {
      let minlat, minlon, maxlat, maxlon;
      gj.features.forEach(f => {
        if (f.geometry.type === 'Point') {
          const lon = f.geometry.coordinates[0];
          const lat = f.geometry.coordinates[1];
          if (minlat === undefined || lat < minlat) minlat = lat;
          if (minlon === undefined || lon < minlon) minlon = lon;
          if (maxlat === undefined || lat > maxlat) maxlat = lat;
          if (maxlon === undefined || lon > maxlon) maxlon = lon;
        }
      });
      _taskExtent = new geoExtent([minlon, minlat], [maxlon, maxlat]);
    }
  };

  _rapidContext.getTaskExtent = () => _taskExtent;


  /* Sources */
  _rapidContext.sources = new Set();


  /* Available datasets */
  let _datasets = {
    'fbRoads': {
      id: 'fbRoads',
      beta: false,
      enabled: true,
      conflated: true,
      service: 'fbml',
      color: RAPID_MAGENTA,
      label: t('rapid_feature_toggle.fbRoads.label'),
      description: t('rapid_feature_toggle.fbRoads.description'),
      license_markdown: t('rapid_feature_toggle.fbRoads.license_markdown')
    },
    'msBuildings': {
      id: 'msBuildings',
      beta: false,
      enabled: true,
      conflated: true,
      service: 'fbml',
      color: RAPID_MAGENTA,
      label: t('rapid_feature_toggle.msBuildings.label'),
      description: t('rapid_feature_toggle.msBuildings.description'),
      license_markdown: t('rapid_feature_toggle.msBuildings.license_markdown')
    }
  };
  _rapidContext.datasets = () => _datasets;


  /* reset any state here */
  _rapidContext.reset = () => {
    _rapidContext.sources = new Set();
  };

  return _rapidContext;
}
