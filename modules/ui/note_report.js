import { osmNote } from '../osm';
import { uiIcon } from './icon';


export function uiNoteReport(context) {
  const l10n = context.systems.l10n;
  let _note;

  function noteReport(selection) {
    let url;
    const osm = context.services.osm;
    if (osm && (_note instanceof osmNote) && !_note.isNew()) {
      url = osm.noteReportURL(_note);
    }

    let link = selection.selectAll('.note-report')
      .data(url ? [url] : []);

    // exit
    link.exit()
      .remove();

    // enter
    let linkEnter = link.enter()
      .append('a')
      .attr('class', 'note-report')
      .attr('target', '_blank')
      .attr('href', d => d)
      .call(uiIcon('#rapid-icon-out-link', 'inline'));

    linkEnter
      .append('span')
      .text(l10n.t('note.report'));
  }


  noteReport.note = function(val) {
    if (!arguments.length) return _note;
    _note = val;
    return noteReport;
  };

  return noteReport;
}
