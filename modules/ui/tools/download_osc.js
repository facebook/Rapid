import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { JXON } from '../../util/jxon';
import { osmChangeset } from '../../osm';
import { actionDiscardTags } from '../../actions';
import { svgIcon } from '../../svg';
import { uiTooltip } from '../tooltip';


export function uiToolDownloadOsc(context) {
  let tool = {
    id: 'download_osc',
    label: t('download_osc.title')
  };

  let button = d3_select(null);
  let tooltip = null;
  let _numChanges = 0;

  function isDisabled() {
    return _numChanges === 0;
  }

  function downloadOsc(d3_event) {
    d3_event.preventDefault();
    let history = context.history();
    if (!context.inIntro() && history.hasChanges()) {
      const changes = history.changes(actionDiscardTags(history.difference()));
      let changeset = new osmChangeset();
      let osc = JXON.stringify(changeset.osmChangeJXON(changes));
      downloadFile(osc,'change.osc');
    }
  }

  function updateCount() {
    const val = context.history().difference().summary().length;
    if (val === _numChanges) return;   // no change
    _numChanges = val;

    button.classed('disabled', isDisabled());
    if (tooltip) {
      tooltip
        .title(t(_numChanges > 0 ? 'download_osc.help' : 'download_osc.no_changes'));
    }

  }

  function downloadFile(data, fileName) {
    let a = document.createElement('a');   // Create an invisible A element
    a.style.display = 'none';
    document.body.appendChild(a);

    // Set the HREF to a Blob representation of the data to be downloaded
    a.href = window.URL.createObjectURL(new Blob([data]));

    // Use download attribute to set set desired file name
    a.setAttribute('download', fileName);

    // Trigger the download by simulating click
    a.click();

    // Cleanup
    window.URL.revokeObjectURL(a.href);
    document.body.removeChild(a);
  }


  tool.install = function(selection) {
    tooltip = uiTooltip()
      .placement('bottom')
      .title(t('download_osc.no_changes'));

    button = selection
      .append('button')
      .attr('class', 'downloadOsc disabled bar-button')
      .on('click', downloadOsc)
      .call(tooltip);

    button
      .call(svgIcon('#iD-icon-download-osc'));

    updateCount();


    context.history()
      .on('change.download_osc', updateCount);

    context
      .on('enter.download_osc', () => {
        button.classed('disabled', isDisabled());
      });
  };


  tool.uninstall = function() {
    context.history()
      .on('change.download_osc', null);

    context
      .on('enter.download_osc', null);

    button = d3_select(null);
    tooltip = null;
  };

  return tool;
}
