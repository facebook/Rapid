import { Extent } from '@id-sdk/extent';
import { localizer, t } from '../core/localizer';
import { gpx } from '@tmcw/togeojson';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { utilRebind } from '../util';


export function coreRapidContext(context) {
  const dispatch = d3_dispatch('task_extent_set');
  let _rapidContext = {};
  _rapidContext.version = '1.1.6';
  _rapidContext.showPowerUser = context.initialHashParams.poweruser === 'true';

  function distinct(value, index, self) {
    return self.indexOf(value) === index;
  }


  /* Task extents */
  let _taskExtent;
  let _isTaskBoundsRect;

  _rapidContext.setTaskExtentByGpxData = function(gpxData) {
    const dom = (new DOMParser()).parseFromString(gpxData, 'text/xml');
    const gj = gpx(dom);
    const lineStringCount = gj.features.reduce((accumulator, currentValue) =>  {
      return accumulator + (currentValue.geometry.type === 'LineString' ? 1 : 0);
    }, 0);

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

        } else if (f.geometry.type === 'LineString' && lineStringCount === 1) {
          const lats = f.geometry.coordinates.map(f => f[0]);
          const lngs = f.geometry.coordinates.map(f => f[1]);
          const uniqueLats = lats.filter(distinct);
          const uniqueLngs = lngs.filter(distinct);
          let eachLatHas2Lngs = true;

          uniqueLats.forEach(lat => {
            const lngsForThisLat = f.geometry.coordinates
              .filter(coord => coord[0] === lat)   // Filter the coords to the ones with this lat
              .map(coord => coord[1])              // Make an array of lngs that associate with that lat
              .filter(distinct);                   // Finally, filter for uniqueness

            if (lngsForThisLat.length !== 2) {
              eachLatHas2Lngs = false;
            }
          });
          // Check for exactly two unique latitudes, two unique longitudes,
          // and that each latitude was associated with exactly 2 longitudes,
          if (uniqueLats.length === 2 && uniqueLngs.length === 2 && eachLatHas2Lngs) {
            _isTaskBoundsRect = true;
          } else {
            _isTaskBoundsRect = false;
          }
        }
      });

      _taskExtent = new Extent([minlon, minlat], [maxlon, maxlat]);
      dispatch.call('task_extent_set');
    }
  };

  _rapidContext.getTaskExtent = () => _taskExtent;

  _rapidContext.isTaskRectangular = () => (!!_taskExtent && _isTaskBoundsRect);


  /* Sources */
  _rapidContext.sources = new Set();


  /* Colors */
  const RAPID_MAGENTA = '#da26d3';
  const COLORS = [
    '#ff0000',  // red
    '#ffa500',  // orange
    '#ffd700',  // gold
    '#00ff00',  // lime
    '#00ffff',  // cyan
    '#1e90ff',  // dodgerblue
    '#da26d3',  // rapid magenta
    '#ffc0cb',  // pink
    '#d3d3d3',  // lightgray
    '#faf0e6'   // linen
  ];
  _rapidContext.colors = () => COLORS;


  /* Available datasets */
  let _datasets = {};
  _rapidContext.datasets = () => _datasets;


  _rapidContext.init = () => {
    localizer.ensureLoaded()
      .then(() => {
        _datasets = {
          'fbRoads': {
            id: 'fbRoads',
            beta: false,
            added: true,         // whether it should appear in the list
            enabled: true,       // whether the user has checked it on
            conflated: true,
            service: 'fbml',
            color: RAPID_MAGENTA,
            label: t('rapid_feature_toggle.fbRoads.label'),
            license_markdown: t('rapid_feature_toggle.fbRoads.license_markdown')
          },
          'msBuildings': {
            id: 'msBuildings',
            beta: false,
            added: true,         // whether it should appear in the list
            enabled: true,       // whether the user has checked it on
            conflated: true,
            service: 'fbml',
            color: RAPID_MAGENTA,
            label: t('rapid_feature_toggle.msBuildings.label'),
            license_markdown: t('rapid_feature_toggle.msBuildings.license_markdown')
          }
        };
      });
  };

  /* reset any state here */
  _rapidContext.reset = () => {
    _rapidContext.sources = new Set();
  };


  return utilRebind(_rapidContext, dispatch, 'on');
}
