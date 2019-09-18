import { geoExtent, geoExtentFromBounds } from '../geo';

import toGeoJSON from '@mapbox/togeojson';
import { dispatch as d3_dispatch } from 'd3-dispatch'; 
import { utilRebind } from '../util'

export function coreRapidContext(context) {
    var rapidContext = {};
    rapidContext.version = '1.0.1';
    var _isRect = undefined; 
    var dispatch = d3_dispatch('task_extent_set');

    function distinct (value, index, self) {
        return self.indexOf(value) === index; 
    }

    var taskExtent;
    rapidContext.setTaskExtentByGpxData = function(gpxData) {
        var dom = (new DOMParser()).parseFromString(gpxData, 'text/xml');
        var gj = toGeoJSON.gpx(dom);
        var uniqueLats = []; 
        var uniqueLngs = []; 
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
                }
    
                if (f.geometry.type === 'LineString') {
                    var lngs = f.geometry.coordinates.map(function(f) {return f[0]})
                    var lats = f.geometry.coordinates.map(function(f) {return f[1]})

                    var uniqueLats = lats.filter(distinct); 
                    var uniqueLngs = lngs.filter(distinct); 

                    //If there are only two unique lngs and two unique lats in the geometry of the 
                    //task area, congrats- we have a rectangle! 
                    if (uniqueLats.length === 2 && uniqueLngs.length === 2)
                    {
                        _isRect = true; 
                    } else {
                        _isRect = false; 
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

        return _isRect;  
    }

    return utilRebind(rapidContext, dispatch, 'on');
}
