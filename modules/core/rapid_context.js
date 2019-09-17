import { geoExtent, geoExtentFromBounds } from '../geo';

import toGeoJSON from '@mapbox/togeojson';


export function coreRapidContext(context) {
    var rapidContext = {};
    rapidContext.version = '1.0.1';
    var _isRect = true;
    const distinct = (value, index, self) => {
        return self.indexOf(value) === index; 
    }

    var taskExtent;
    rapidContext.setTaskExtentByGpxData = function(gpxData) {
        var dom = (new DOMParser()).parseFromString(gpxData, 'text/xml');
        var gj = toGeoJSON.gpx(dom);
        var lats = []; 
        var lngs = []; 
    if (gj.type === 'FeatureCollection') {
            var minlat, minlon, maxlat, maxlon;
            //Calculate task extent. 
            gj.features.forEach(function(f) {
                if (f.geometry.type === 'Point') {
                    var lon = f.geometry.coordinates[0];
                    var lat = f.geometry.coordinates[1];
                    if (minlat === undefined || lat < minlat) minlat = lat;
                    if (minlon === undefined || lon < minlon) minlon = lon;
                    if (maxlat === undefined || lat > maxlat) maxlat = lat;
                    if (maxlon === undefined || lon > maxlon) maxlon = lon;

                    //Keep a list of all the unique lats/lngs we encounter.
                    //if (lats.indexOf(lat) === -1) lats.push(lat);
                    //if (lngs.indexOf(lng) === -1) lngs.push(lng);    
                }
            });
            taskExtent = new geoExtent([minlon, minlat], [maxlon, maxlat]);

            //If there are only two unique lngs and two unique lats in the geometry of the 
            //geoJson, congrats- we have a rectangle! 
            // if (lats.length() === 2 && lngs.length === 2)
            // {
            //     _isRect = true; 
            // }
        }
    };


    rapidContext.getTaskExtent = function() {
        return taskExtent;
    };


    rapidContext.isTaskRectangular = function() {        
        return _isRect; 
    };


    return rapidContext;
}
