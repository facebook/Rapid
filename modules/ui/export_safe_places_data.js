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
            var _changeset = new osmChangeset();
            var changes = history.changes(actionDiscardTags(history.difference()));
            var osc = JXON.stringify(_changeset.osmChangeJXON(changes));
            downloadFile(osc,'safeplace_gps_data.jxon');
        }
    }; 
    }