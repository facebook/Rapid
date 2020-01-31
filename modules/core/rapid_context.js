import { geoExtent } from '../geo';

import toGeoJSON from '@mapbox/togeojson';
import { dispatch as d3_dispatch } from 'd3-dispatch'; 
import { utilRebind } from '../util';

export function coreRapidContext() {
    var rapidContext = {};
    rapidContext.version = '1.0.6';
    var _isTaskBoundsRect = undefined; 
    var dispatch = d3_dispatch('task_extent_set');

    function distinct (value, index, self) {
        return self.indexOf(value) === index; 
    }

    var taskExtent;
    rapidContext.setTaskExtentByGpxData = function(gpxData) {
        var dom = (new DOMParser()).parseFromString(gpxData, 'text/xml');
        var gj = toGeoJSON.gpx(dom);

        var lineStringCount = gj.features.reduce(function (accumulator, currentValue) {
            return accumulator + (currentValue.geometry.type === 'LineString' ? 1 : 0);
        }, 0); 

        if (gj.type === 'FeatureCollection') {
            var minlat, minlon, maxlat, maxlon;
            // Calculate task extent. 
            gj.features.forEach(function(f) {
                if (f.geometry.type === 'Point') {
                    var lon = f.geometry.coordinates[0];
                    var lat = f.geometry.coordinates[1];
                    if (minlat === undefined || lat < minlat) minlat = lat;
                    if (minlon === undefined || lon < minlon) minlon = lon;
                    if (maxlat === undefined || lat > maxlat) maxlat = lat;
                    if (maxlon === undefined || lon > maxlon) maxlon = lon;                    
                }
    
                if (f.geometry.type === 'LineString' && lineStringCount === 1) {
                    var lats = f.geometry.coordinates.map(function(f) {return f[0];});
                    var lngs = f.geometry.coordinates.map(function(f) {return f[1];});
                    var uniqueLats = lats.filter(distinct); 
                    var uniqueLngs = lngs.filter(distinct); 

                    var eachLatHas2Lngs = true; 
                    uniqueLats.forEach(function (lat) {
                        var lngsForThisLat = f.geometry.coordinates
                            // Filter the coords to the ones with this lat
                            .filter(function(coord){ return coord[0] === lat; })
                            // Make an array of lngs that associate with that lat
                            .map(function(coord){ return coord[1]; })
                            // Finally, filter for uniqueness
                            .filter(distinct); 

                        if (lngsForThisLat.length !== 2) {
                            eachLatHas2Lngs = false; 
                        }
                    }); 
                    // Check for exactly two unique latitudes, two unique longitudes, 
                    //and that each latitude was associated with exactly 2 longitudes, 
                    // 
                    if (uniqueLats.length === 2 && uniqueLngs.length === 2 && eachLatHas2Lngs) { 
                        _isTaskBoundsRect = true; 
                    } else {
                        _isTaskBoundsRect = false; 
                    }
                }
            });
            taskExtent = new geoExtent([minlon, minlat], [maxlon, maxlat]);
            dispatch.call('task_extent_set');
        }
    };


    rapidContext.getTaskExtent = function() {
        return taskExtent;
    };


    rapidContext.isTaskRectangular = function() {
        if (!taskExtent) { 
            return false; 
        }

        return _isTaskBoundsRect;  
    };

    return utilRebind(rapidContext, dispatch, 'on');
}
