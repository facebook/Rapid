import { uiIcon } from './icon';


export function uiNoteHeader(context) {
  let _note;


  function noteHeader(selection) {
    let header = selection.selectAll('.note-header')
      .data((_note ? [_note] : []), d => d.status + d.id );

    header.exit()
      .remove();

    let headerEnter = header.enter()
      .append('div')
      .attr('class', 'note-header');

    let iconEnter = headerEnter
      .append('div')
      .attr('class', d => `note-header-icon ${d.status}`)
      .classed('new', d => d.id < 0);

    iconEnter
      .append('div')
      .attr('class', 'preset-icon-28')
      .call(uiIcon('#rapid-icon-note', 'note-fill'));

    iconEnter
      .each(d => {
        let statusIcon;
        if (d.id < 0) {
          statusIcon = '#rapid-icon-plus';
        } else if (d.status === 'open') {
          statusIcon = '#rapid-icon-close';
        } else {
          statusIcon = '#rapid-icon-apply';
        }
        iconEnter
          .append('div')
          .attr('class', 'note-icon-annotation')
          .call(uiIcon(statusIcon, 'icon-annotation'));
      });

    headerEnter
      .append('div')
      .attr('class', 'note-header-label')
      .text(d => {
        if (_note.isNew()) {
          return context.t('note.new');
        } else {
          return context.t('note.note') + ' ' + d.id + ' ' +
            (d.status === 'closed' ? context.t('note.closed') : '');
        }
      });
  }


  noteHeader.note = function(val) {
    if (!arguments.length) return _note;
    _note = val;
    return noteHeader;
  };


  return noteHeader;
}
