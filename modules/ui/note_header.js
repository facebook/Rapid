import { uiIcon } from './icon.js';


export function uiNoteHeader(context) {
  const l10n = context.systems.l10n;
  let _note;


  function render(selection) {
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
          return l10n.t('note.new');
        } else {
          return l10n.t('note.note') + ' ' + d.id + ' ' +
            (d.status === 'closed' ? l10n.t('note.closed') : '');
        }
      });
  }


  render.note = function(val) {
    if (!arguments.length) return _note;
    _note = val;
    return render;
  };


  return render;
}
