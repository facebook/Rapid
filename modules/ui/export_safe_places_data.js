import { geoExtent } from '../geo';
import { event as d3_event } from 'd3-selection';
import { t } from '../util/locale';
import { uiCmd } from './cmd';
import { osmChangeset } from '../osm';
import { JXON } from '../util/jxon';
import { actionDiscardTags } from '../actions';
import { uiTooltipHtml } from './tooltipHtml';
import { tooltip } from '../util/tooltip';
import _isEmpty from 'lodash-es/isEmpty'; 

export function uiExportSafePlacesData(context) {
    var history = context.history();

    function downloadFile(data, fileName) {
        // Create an invisible A element
        var a = document.createElement('a');
        a.style.display = 'none';
        document.body.appendChild(a);
  
        // Set the HREF to a Blob representation of the data to be downloaded
        a.href = window.URL.createObjectURL(
          new Blob([data])
        );
  
        // Use download attribute to set set desired file name
        a.setAttribute('download', fileName);
  
        // Trigger the download by simulating click
        a.click();
  
        // Cleanup
        window.URL.revokeObjectURL(a.href);
        document.body.removeChild(a);
    }


    return function save() {
        d3_event.preventDefault();
        if (!context.inIntro() && history.hasChanges()) {
            var extent = geoExtent([
              [-180, -90],
              [180, 90]
            ]);
            var all = context.intersects(extent);
            window.alert('all has ' + all.length + ' points');

            function renderAsPoint(entity) {
              return entity.geometry(context.graph()) === 'point';
            }
            var nodesForExport = all.filter(renderAsPoint);

            var exportJson = [];
            for (var i = 0; i < nodesForExport.length; i++) {
              var entry = {
                lon: nodesForExport[i].loc[0],
                lat: nodesForExport[i].loc[1],
                time: Number(nodesForExport[i].tags.time)
              };
              exportJson.push(entry);
            }
            downloadFile(JSON.stringify(exportJson, null, 2), 'safeplace_gps_data.json');
        }
    };
}