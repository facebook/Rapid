import { geoExtent } from '../geo';

import toGeoJSON from '@mapbox/togeojson';


export function coreRapidContext(context) {
    var rapidContext = {};
    rapidContext.version = '1.0.1';

    var taskExtent;
    rapidContext.setTaskExtentByGpxData = function(gpxData) {
        var dom = (new DOMParser()).parseFromString(gpxData, 'text/xml');
        var gj = toGeoJSON.gpx(dom);
        if (gj.type === 'FeatureCollection') {
            var minlat, minlon, maxlat, maxlon;
            gj.features.forEach(function(f) {
                if (f.geometry.type === 'Point') {
                    var lon = f.geometry.coordinates[0];
                    var lat = f.geometry.coordinates[1];
                    if (minlat === undefined || lat < minlat) minlat = lat;
                    if (minlon === undefined || lon < minlon) minlon = lon;
                    if (maxlat === undefined || lat > maxlat) maxlat = lat;
                    if (maxlon === undefined || lon > maxlon) maxlon = lon;
                }
            });
            taskExtent = new geoExtent([minlon, minlat], [maxlon, maxlat]);
        }
    };
    rapidContext.getTaskExtent = function() {
        return taskExtent;
    };

    return rapidContext;
}
