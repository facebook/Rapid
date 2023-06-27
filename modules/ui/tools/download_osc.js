import { JXON } from '../../util/jxon';
import { osmChangeset } from '../../osm';
import { actionDiscardTags } from '../../actions';
import { uiIcon } from '../icon';
import { uiTooltip } from '../tooltip';


export function uiToolDownloadOsc(context) {
  let tool = {
    id: 'download_osc',
    label: context.t('download_osc.title')
  };

  let _button = null;
  let _tooltip = null;
  let _numChanges = 0;

  function isDisabled() {
    return _numChanges === 0;
  }

  function downloadOsc(d3_event) {
    d3_event.preventDefault();
    const editSystem = context.systems.edits;
    if (!context.inIntro && editSystem.hasChanges()) {
      const changes = editSystem.changes(actionDiscardTags(editSystem.difference()));
      const changeset = new osmChangeset();
      const osc = JXON.stringify(changeset.osmChangeJXON(changes));
      downloadFile(osc, 'change.osc');
    }
  }

  function updateCount() {
    if (!_tooltip) return;

    const val = context.systems.edits.difference().summary().size;
    if (val === _numChanges) return;   // no change
    _numChanges = val;

    if (_tooltip) {
      _tooltip
        .title(context.t(_numChanges > 0 ? 'download_osc.help' : 'download_osc.no_changes'));
    }
    updateStyle();
  }


  function updateStyle() {
    if (!_button) return;
    _button.classed('disabled', isDisabled());
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
    if (_button && _tooltip) return;  // already installed

    _tooltip = uiTooltip(context)
      .placement('bottom')
      .title(context.t('download_osc.no_changes'));

    _button = selection
      .append('button')
      .attr('class', 'downloadOsc disabled bar-button')
      .on('click', downloadOsc)
      .call(_tooltip);

    _button
      .call(uiIcon('#rapid-icon-download-osc'));

    updateCount();

    context.systems.edits.on('change', updateCount);
    context.on('modechange', updateStyle);
  };


  tool.uninstall = function() {
    if (!_button && !_tooltip) return;  // already uninstalled

    context.systems.edits.off('change', updateCount);
    context.off('modechange', updateStyle);

    _button = null;
    _tooltip = null;
  };

  return tool;
}
