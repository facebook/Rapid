import { t } from '../core/localizer';
import { uiIcon } from './icon';


export function uiNoteHeader() {
    var _note;


    function noteHeader(selection) {
        var header = selection.selectAll('.note-header')
            .data(
                (_note ? [_note] : []),
                function(d) { return d.status + d.id; }
            );

        header.exit()
            .remove();

        var headerEnter = header.enter()
            .append('div')
            .attr('class', 'note-header');

        var iconEnter = headerEnter
            .append('div')
            .attr('class', function(d) { return 'note-header-icon ' + d.status; })
            .classed('new', function(d) { return d.id < 0; });

        iconEnter
            .append('div')
            .call(uiIcon('#rapid-icon-note', 'note-fill'));

        iconEnter.each(function(d) {
            var statusIcon;
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
            .html(function(d) {
                if (_note.isNew()) { return t('note.new'); }
                return t('note.note') + ' ' + d.id + ' ' +
                    (d.status === 'closed' ? t('note.closed') : '');
            });
    }


    noteHeader.note = function(val) {
        if (!arguments.length) return _note;
        _note = val;
        return noteHeader;
    };


    return noteHeader;
}
