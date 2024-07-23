import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { uiIcon } from './icon.js';
import { uiNoteComments } from './note_comments.js';
import { uiNoteHeader } from './note_header.js';
import { uiNoteReport } from './note_report.js';
import { uiViewOnOSM } from './view_on_osm.js';
import { utilNoAuto, utilRebind } from '../util/index.js';


export function uiNoteEditor(context) {
  const l10n = context.systems.l10n;
  const dispatch = d3_dispatch('change');
  const noteComments = uiNoteComments(context);
  const noteHeader = uiNoteHeader(context);

  var _note;
  var _newNote;


    function render(selection) {
        var header = selection.selectAll('.header')
            .data([0]);

        var headerEnter = header.enter()
            .append('div')
            .attr('class', 'header fillL');

        headerEnter
            .append('button')
            .attr('class', 'close')
            .on('click', function() {
                context.enter('browse');
            })
            .call(uiIcon('#rapid-icon-close'));

        headerEnter
            .append('h3')
            .text(l10n.t('note.title'));


        var body = selection.selectAll('.body')
            .data([0]);

        body = body.enter()
            .append('div')
            .attr('class', 'body')
            .merge(body);

        var editor = body.selectAll('.note-editor')
            .data([0]);

        editor.enter()
            .append('div')
            .attr('class', 'modal-section note-editor')
            .merge(editor)
            .call(noteHeader.note(_note))
            .call(noteComments.note(_note))
            .call(noteSaveSection);

        var footer = selection.selectAll('.sidebar-footer')
            .data([0]);

        footer.enter()
            .append('div')
            .attr('class', 'sidebar-footer')
            .merge(footer)
            .call(uiViewOnOSM(context).what(_note))
            .call(uiNoteReport(context).note(_note));


        // rerender the note editor on any auth change
        var osm = context.services.osm;
        if (osm) {
            osm.on('authchange', function() {
                selection.call(render);
            });
        }
    }


    function noteSaveSection(selection) {
        var isSelected = (_note && _note.id === context.selectedIDs()[0]);
        var noteSave = selection.selectAll('.note-save')
            .data((isSelected ? [_note] : []), function(d) { return d.status + d.id; });

        // exit
        noteSave.exit()
            .remove();

        // enter
        var noteSaveEnter = noteSave.enter()
            .append('div')
            .attr('class', 'note-save save-section cf');

        noteSaveEnter
            .append('h4')
            .attr('class', '.note-save-header')
            .text(function() {
                return _note.isNew() ? l10n.t('note.newDescription') : l10n.t('note.newComment');
            });

        var commentTextarea = noteSaveEnter
            .append('textarea')
            .attr('class', 'new-comment-input')
            .attr('placeholder', l10n.t('note.inputPlaceholder'))
            .attr('maxlength', 1000)
            .property('value', function(d) { return d.newComment; })
            .call(utilNoAuto)
            .on('keydown.note-input', keydown)
            .on('input.note-input', changeInput)
            .on('blur.note-input', changeInput);

        if (!commentTextarea.empty() && _newNote) {
            // autofocus the comment field for new notes
            commentTextarea.node().focus();
        }

        // update
        noteSave = noteSaveEnter
            .merge(noteSave)
            .call(userDetails)
            .call(noteSaveButtons);


        // fast submit if user presses cmd+enter
        function keydown(d3_event) {
            if (!(d3_event.keyCode === 13 && // ↩ Return
                d3_event.metaKey)) return;

            var osm = context.services.osm;
            if (!osm) return;

            var hasAuth = osm.authenticated();
            if (!hasAuth) return;

            if (!_note.newComment) return;

            d3_event.preventDefault();

            d3_select(this)
                .on('keydown.note-input', null);

            // focus on button and submit
            window.setTimeout(function() {
                if (_note.isNew()) {
                    noteSave.selectAll('.save-button').node().focus();
                    clickSave(_note);
                } else  {
                    noteSave.selectAll('.comment-button').node().focus();
                    clickComment(_note);
                }
            }, 10);
        }


        function changeInput() {
            var input = d3_select(this);
            var val = input.property('value').trim() || undefined;

            // store the unsaved comment with the note itself
            _note = _note.update({ newComment: val });

            var osm = context.services.osm;
            if (osm) {
                osm.replaceNote(_note);  // update note cache
            }

            noteSave
                .call(noteSaveButtons);
        }
    }


    function userDetails(selection) {
        var detailSection = selection.selectAll('.detail-section')
            .data([0]);

        detailSection = detailSection.enter()
            .append('div')
            .attr('class', 'detail-section')
            .merge(detailSection);

        var osm = context.services.osm;
        if (!osm) return;

        // Add warning if user is not logged in
        var hasAuth = osm.authenticated();
        var authWarning = detailSection.selectAll('.auth-warning')
            .data(hasAuth ? [] : [0]);

        authWarning.exit()
            .transition()
            .duration(200)
            .style('opacity', 0)
            .remove();

        var authEnter = authWarning.enter()
            .insert('div', '.tag-reference-body')
            .attr('class', 'field-warning auth-warning')
            .style('opacity', 0);

        authEnter
            .call(uiIcon('#rapid-icon-alert', 'inline'));

        authEnter
            .append('span')
            .text(l10n.t('note.login'));

        authEnter
            .append('a')
            .attr('target', '_blank')
            .call(uiIcon('#rapid-icon-out-link', 'inline'))
            .append('span')
            .text(l10n.t('login'))
            .on('click.note-login', function(d3_event) {
                d3_event.preventDefault();
                osm.authenticate();
            });

        authEnter
            .transition()
            .duration(200)
            .style('opacity', 1);


        var prose = detailSection.selectAll('.note-save-prose')
            .data(hasAuth ? [0] : []);

        prose.exit()
            .remove();

        prose = prose.enter()
            .append('p')
            .attr('class', 'note-save-prose')
            .text(l10n.t('note.upload_explanation'))
            .merge(prose);

        osm.userDetails(function(err, user) {
            if (err) return;

            var userLink = d3_select(document.createElement('div'));

            if (user.image_url) {
                userLink
                    .append('img')
                    .attr('src', user.image_url)
                    .attr('class', 'icon pre-text user-icon');
            }

            userLink
                .append('a')
                .attr('class', 'user-info')
                .text(user.display_name)
                .attr('href', osm.userURL(user.display_name))
                .attr('target', '_blank');

            prose
                .html(l10n.tHtml('note.upload_explanation_with_user', { user: userLink.html() }));
        });
    }


    function noteSaveButtons(selection) {
        var osm = context.services.osm;
        var hasAuth = osm && osm.authenticated();

        var isSelected = (_note && _note.id === context.selectedIDs()[0]);
        var buttonSection = selection.selectAll('.buttons')
            .data((isSelected ? [_note] : []), function(d) { return d.status + d.id; });

        // exit
        buttonSection.exit()
            .remove();

        // enter
        var buttonEnter = buttonSection.enter()
            .append('div')
            .attr('class', 'buttons');

        if (_note.isNew()) {
            buttonEnter
                .append('button')
                .attr('class', 'button cancel-button secondary-action')
                .text(l10n.t('confirm.cancel'));

            buttonEnter
                .append('button')
                .attr('class', 'button save-button action')
                .text(l10n.t('note.save'));

        } else {
            buttonEnter
                .append('button')
                .attr('class', 'button status-button action');

            buttonEnter
                .append('button')
                .attr('class', 'button comment-button action')
                .text(l10n.t('note.comment'));
        }


        // update
        buttonSection = buttonSection
            .merge(buttonEnter);

        buttonSection.select('.cancel-button')   // select and propagate data
            .on('click.cancel', clickCancel);

        buttonSection.select('.save-button')     // select and propagate data
            .attr('disabled', isSaveDisabled)
            .on('click.save', clickSave);

        buttonSection.select('.status-button')   // select and propagate data
            .attr('disabled', (hasAuth ? null : true))
            .text(function(d) {
                var action = (d.status === 'open' ? 'close' : 'open');
                var andComment = (d.newComment ? '_comment' : '');
                return l10n.t('note.' + action + andComment);
            })
            .on('click.status', clickStatus);

        buttonSection.select('.comment-button')   // select and propagate data
            .attr('disabled', isSaveDisabled)
            .on('click.comment', clickComment);


        function isSaveDisabled(d) {
            return (hasAuth && d.status === 'open' && d.newComment) ? null : true;
        }
    }



    function clickCancel(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - #4641
        var osm = context.services.osm;
        if (osm) {
            osm.removeNote(d);
        }
        context.enter('browse');
        dispatch.call('change');
    }


    function clickSave(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - #4641
        var osm = context.services.osm;
        if (osm) {
            osm.postNoteCreate(d, function(err, note) {
                dispatch.call('change', note);
            });
        }
    }


    function clickStatus(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - #4641
        var osm = context.services.osm;
        if (osm) {
            var setStatus = (d.status === 'open' ? 'closed' : 'open');
            osm.postNoteUpdate(d, setStatus, function(err, note) {
                dispatch.call('change', note);
            });
        }
    }

    function clickComment(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - #4641
        var osm = context.services.osm;
        if (osm) {
            osm.postNoteUpdate(d, d.status, function(err, note) {
                dispatch.call('change', note);
            });
        }
    }


    render.note = function(val) {
        if (!arguments.length) return _note;
        _note = val;
        return render;
    };

    render.newNote = function(val) {
        if (!arguments.length) return _newNote;
        _newNote = val;
        return render;
    };


    return utilRebind(render, dispatch, 'on');
}
