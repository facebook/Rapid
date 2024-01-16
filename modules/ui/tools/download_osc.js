import { JXON } from '../../util/jxon.js';
import { osmChangeset } from '../../osm/index.js';
import { actionDiscardTags } from '../../actions/index.js';
import { uiIcon } from '../icon.js';
import { uiTooltip } from '../tooltip.js';


export function uiToolDownloadOsc(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;

  let tool = {
    id: 'download_osc',
    label: l10n.t('download_osc.title')
  };

  let _button = null;
  let _tooltip = null;
  let _numChanges = 0;

  function isDisabled() {
    return _numChanges === 0;
  }

  function downloadOsc(d3_event) {
    d3_event.preventDefault();
    if (!context.inIntro && editor.hasChanges()) {
      const changes = editor.changes(actionDiscardTags(editor.difference()));
      const changeset = new osmChangeset();
      const osc = JXON.stringify(changeset.osmChangeJXON(changes));
      downloadFile(osc, 'change.osc');
    }
  }

  function updateCount() {
    if (!_tooltip) return;

    const val = editor.difference().summary().size;
    if (val === _numChanges) return;   // no change
    _numChanges = val;

    if (_tooltip) {
      _tooltip
        .title(l10n.t(_numChanges > 0 ? 'download_osc.help' : 'download_osc.no_changes'));
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
      .title(l10n.t('download_osc.no_changes'));

    _button = selection
      .append('button')
      .attr('class', 'downloadOsc disabled bar-button')
      .on('click', downloadOsc)
      .call(_tooltip);

    _button
      .call(uiIcon('#rapid-icon-download-osc'));

    updateCount();

    editor.on('stablechange', updateCount);
    context.on('modechange', updateStyle);
  };


  tool.uninstall = function() {
    if (!_button && !_tooltip) return;  // already uninstalled

    editor.off('stablechange', updateCount);
    context.off('modechange', updateStyle);

    _button = null;
    _tooltip = null;
  };

  return tool;
}
