import { event as d3_event } from 'd3-selection';

import { t } from '../../util/locale';
import { JXON } from '../../util/jxon';
import { osmChangeset } from '../../osm';
import { actionDiscardTags } from '../../actions';
import { svgIcon } from '../../svg';
import { uiTooltipHtml } from '../tooltipHtml';
import { tooltip } from '../../util/tooltip';


export function uiToolDownloadOsc(context) {

    var tool = {
        id: 'download_osc',
        label: t('download_osc.title')
    };

    var button = null;
    var tooltipBehavior = null;
    var history = context.history();
    var _numChanges = 0;

    function isDisabled() {
        return _numChanges === 0;
    }

    function downloadOsc() {
        d3_event.preventDefault();
        if (!context.inIntro() && history.hasChanges()) {
            var _changeset = new osmChangeset();
            var changes = history.changes(actionDiscardTags(history.difference()));
            var osc = JXON.stringify(_changeset.osmChangeJXON(changes));
            downloadFile(osc,'change.osc');
        }
    }

    function updateCount() {
        var val = history.difference().summary().length;
        if (val === _numChanges) return;
        _numChanges = val;

        if (tooltipBehavior) {
            tooltipBehavior
                .title(uiTooltipHtml(
                    t(_numChanges > 0 ? 'download_osc.help' : 'download_osc.no_changes'))
                );
        }

        if (button) {
            button.classed('disabled', isDisabled()); 
        }
    }

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


    tool.render = function(selection) {

        tooltipBehavior = tooltip()
            .placement('bottom')
            .html(true)
            .title(uiTooltipHtml(t('download_osc.no_changes')));

        button = selection
            .append('button')
            .attr('class', 'downloadOsc disabled bar-button')
            .on('click', downloadOsc)
            .call(tooltipBehavior);

        button
            .call(svgIcon('#iD-icon-download-osc'));


        updateCount();


        context.history()
            .on('change.download_osc', updateCount);

        context
            .on('enter.download_osc', function() {
                if (button) {
                    button
                        .classed('disabled', isDisabled());
                }
            });
    };

    tool.uninstall = function() {

        context.history()
            .on('change.download', null);

        context
            .on('enter.download', null);

        button = null;
        tooltipBehavior = null;
    };

    return tool;
}
