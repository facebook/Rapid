import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { uiIcon } from './icon';

import { uiMapRouletteDetails } from './maproulette_details';
import { uiMapRouletteHeader } from './maproulette_header';
import { uiViewOnMapRoulette } from './view_on_maproulette';
import { utilNoAuto, utilRebind } from '../util';


export function uiMapRouletteEditor(context) {
  const l10n = context.systems.l10n;
  const maproulette = context.services.maproulette;
  const dispatch = d3_dispatch('change');
  const mapRouletteDetails = uiMapRouletteDetails(context);
  const mapRouletteHeader = uiMapRouletteHeader(context);
  let _maprouletteTask;
  var _comment;
  var _newComment;
  let _actionTaken;

  function maprouletteEditor(selection) {
    const header = selection.selectAll('.header')
      .data([0]);

    const headerEnter = header.enter()
      .append('div')
      .attr('class', 'header fillL');

    headerEnter
      .append('button')
      .attr('class', 'close')
      .on('click', () => context.enter('browse'))
      .call(uiIcon('#rapid-icon-close'));

    headerEnter
      .append('h3')
      .html(l10n.tHtml('map_data.layers.maproulette.title'));

    let body = selection.selectAll('.body')
      .data([0]);

    body = body.enter()
      .append('div')
      .attr('class', 'body')
      .merge(body);

    let editor = body.selectAll('.mr-editor')
      .data([0]);

    editor.enter()
      .append('div')
      .attr('class', 'modal-section mr-editor')
      .merge(editor)
      .call(mapRouletteHeader.task(_maprouletteTask))
      .call(mapRouletteDetails.task(_maprouletteTask))
      .call(maprouletteSaveSection)
      .call(commentSaveSection);

    const footer = selection.selectAll('.footer')
      .data([0]);

    footer.enter()
      .append('div')
      .attr('class', 'footer')
      .merge(footer)
      .call(uiViewOnMapRoulette(context).what(_maprouletteTask));
  }

  function maprouletteSaveSection(selection) {
    const errID = _maprouletteTask?.id;
    const isSelected = errID && context.selectedData().has(errID);
    const isShown = (_maprouletteTask && isSelected);
    let saveSection = selection.selectAll('.mr-save')
      .data((isShown ? [_maprouletteTask] : []), d => `${d.id}-${d.status || 0}` );

    // exit
    saveSection.exit()
      .remove();

    // enter
    const saveSectionEnter = saveSection.enter()
      .append('div')
      .attr('class', 'mr-save save-section cf');

    // update
    saveSection = saveSectionEnter
      .merge(saveSection)
      .call(userDetails)
      .call(mRSaveButtons);
  }


  function getActionColor(action) {
    switch (action) {
      case 'FIXED':
        return '#62c9d3';
      case `CAN'T COMPLETE`:
        return '#fe5e63';
      case 'ALREADY FIXED':
        return '#ccb185';
      case 'NOT AN ISSUE':
        return '#f7ba59';
      default:
        return 'black';
    }
  }


  function commentSaveSection(selection) {
    const errID = _maprouletteTask?.id;
    const isSelected = errID && context.selectedData().has(errID);
    const showNoteSaveSection = _maprouletteTask?.showNoteSaveSection;

    let commentSave = selection.selectAll('.note-save')
      .data((isSelected && showNoteSaveSection ? [_maprouletteTask] : []), d => d.status + d.id);
        // exit
        commentSave.exit()
            .remove();

        // enter
        var commentSaveEnter = commentSave.enter()
          .append('div')
          .attr('class', 'note-save save-section cf');
        commentSaveEnter
          .append('h4')
          .attr('class', 'note-save-header');
        // update
        commentSave = commentSaveEnter.merge(commentSave);
        commentSave.select('.note-save-header')  // Corrected class name
          .html(l10n.t('map_data.layers.maproulette.comment') + ' <span style="color: ' + getActionColor(_actionTaken) + ';">' + _actionTaken + '</span>');

        var commentTextarea = commentSaveEnter
          .append('textarea')
          .attr('class', 'new-comment-input')
          .attr('placeholder', l10n.t('map_data.layers.maproulette.inputPlaceholder'))
          .attr('maxlength', 1000)
          .property('value', function(d) { return d.newComment; })
          .call(utilNoAuto)
          .on('input.note-input', changeInput)
          .on('blur.note-input', changeInput)
          .style('resize', 'none');

        if (!commentTextarea.empty() && _newComment) {
            // autofocus the comment field for new notes
            commentTextarea.node().focus();
        }
      // update
      commentSave = commentSaveEnter
          .merge(commentSave)
          .call(userDetails)
          .call(submitButtons);

        function changeInput() {
          var input = d3_select(this);
          var val = input.property('value').trim() || undefined;

          // Check if _comment is defined before calling the update method
          if (_comment) {
            _comment = _comment.update({ _newComment: val });
          }

          var osm = context.services.osm;
          if (osm) {
            osm.replaceNote(_comment);  // update note cache
          }

          commentSave
              .call(mRSaveButtons);
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
            .html(l10n.tHtml('map_data.layers.maproulette.login'));

        authEnter
            .append('a')
            .attr('target', '_blank')
            .call(uiIcon('#rapid-icon-out-link', 'inline'))
            .append('span')
            .html(l10n.tHtml('login'))
            .on('click.note-login', function(d3_event) {
                d3_event.preventDefault();
                osm.authenticate();
            });

        authEnter
            .transition()
            .duration(200)
            .style('opacity', 1);


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

        });
    }

  function mRSaveButtons(selection) {
    var osm = context.services.osm;
    var hasAuth = osm && osm.authenticated();
    const errID = _maprouletteTask?.id;
    const isSelected = errID && context.selectedData().has(errID);
    let buttonSection = selection.selectAll('.buttons')
      .data((isSelected ? [_maprouletteTask] : []), d => d.status + d.id);

    // exit
    buttonSection.exit()
      .remove();

    // enter
    const buttonEnter = buttonSection.enter()
      .append('div')
      .attr('class', 'buttons');

    buttonEnter
      .append('button')
      .attr('class', 'button fixedIt-button action');

    buttonEnter
      .append('button')
      .attr('class', 'button cantComplete-button action');

    buttonEnter
      .append('button')
      .attr('class', 'button alreadyFixed-button action');

    buttonEnter
      .append('button')
      .attr('class', 'button notAnIssue-button action');

    // update
    buttonSection = buttonSection
      .merge(buttonEnter);

    buttonSection.select('.fixedIt-button')
      .attr('disabled', isSaveDisabled(_maprouletteTask))
      .html(l10n.tHtml('map_data.layers.maproulette.fixedIt'))
      .on('click.close', function(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - iD#4641
        if (maproulette) {
          _actionTaken = 'FIXED';
          d.showNoteSaveSection = true;
          updateMRSaveButtonsVisibility(d.showNoteSaveSection);
          selection.call(commentSaveSection);
        }
      });

    buttonSection.select('.cantComplete-button')
      .attr('disabled', isSaveDisabled(_maprouletteTask))
      .html(l10n.tHtml('map_data.layers.maproulette.cantComplete'))
      .on('click.ignore', function(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - iD#4641
        if (maproulette) {
          _actionTaken = `CAN'T COMPLETE`;
          d.showNoteSaveSection = true;
          updateMRSaveButtonsVisibility(d.showNoteSaveSection);
          selection.call(commentSaveSection);
        }
      });

    buttonSection.select('.alreadyFixed-button')
      .attr('disabled', isSaveDisabled(_maprouletteTask))
      .html(l10n.tHtml('map_data.layers.maproulette.alreadyFixed'))
      .on('click.ignore', function(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - iD#4641
        if (maproulette) {
          _actionTaken = 'ALREADY FIXED';
          d.showNoteSaveSection = true;
          updateMRSaveButtonsVisibility(d.showNoteSaveSection);
          selection.call(commentSaveSection);
        }
      });

    buttonSection.select('.notAnIssue-button')
      .attr('disabled', isSaveDisabled(_maprouletteTask))
      .html(l10n.tHtml('map_data.layers.maproulette.notAnIssue'))
      .on('click.ignore', function(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - iD#4641
        if (maproulette) {
          _actionTaken = 'NOT AN ISSUE';
          d.showNoteSaveSection = true;
          updateMRSaveButtonsVisibility(d.showNoteSaveSection);
          selection.call(commentSaveSection);
        }
      });


    function isSaveDisabled(d) {
      return (hasAuth && d.service === 'maproulette') ? null : true;
    }
  }


  function updateMRSaveButtonsVisibility(showNoteSaveSection) {
    if (showNoteSaveSection) {
      d3_select('.note-save').style('display', 'block');   // Show the commentSaveSection
      d3_select('.mr-save .buttons').style('display', 'none');  // Hide the buttons
    } else {
      d3_select('.note-save').style('display', 'none');  // Hide the commentSaveSection
      d3_select('.mr-save .buttons').style('display', '');  // Show the buttons
    }
  }


  function submitButtons(selection) {
    const osm = context.services.osm;
    const userID = osm._userDetails.id;
    const errID = _maprouletteTask?.id;
    const isSelected = errID && context.selectedData().has(errID);
    let buttonSection = selection.selectAll('.buttons')
      .data((isSelected ? [_maprouletteTask] : []), d => d.status + d.id);

    // exit
    buttonSection.exit()
      .remove();

    // enter
    const buttonEnter = buttonSection.enter()
      .append('div')
      .attr('class', 'buttons');

    buttonEnter
      .append('button')
      .attr('class', 'button cancel-button action');

    buttonEnter
      .append('button')
      .attr('class', 'button submit-button action')
      .attr('disabled', true);

    // update
    buttonSection = buttonSection
      .merge(buttonEnter);

    buttonSection.select('.cancel-button')
      .html(l10n.tHtml('map_data.layers.maproulette.cancel'))
      .on('click.close', function(d3_event, d) {
        _actionTaken = '';
        d.showNoteSaveSection = false;
        updateMRSaveButtonsVisibility(d.showNoteSaveSection);
        selection.call(commentSaveSection);
      });

    buttonSection.select('.submit-button')
      .html(l10n.tHtml('map_data.layers.maproulette.submit'))
      .on('click.ignore', function(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - iD#4641
        if (maproulette) {
          d.newStatus = 'done';
          d.comment = d3_select('.new-comment-input').property('value').trim();
          d.taskId = d.id;
          d.userId = userID;
          maproulette.postUpdate(d, (err, item) => dispatch.call('change', item));
          d.showNoteSaveSection = false;
          updateMRSaveButtonsVisibility(d.showNoteSaveSection);
        }
      });

      selection.select('.new-comment-input')
        .on('input.note-input', function() {
          var comment = d3_select(this).property('value').trim();
          var button = selection.select('.submit-button');
          if (comment !== '') {
            button.attr('disabled', null); // Enable the button if the comment is not empty
          } else {
            button.attr('disabled', true); // Disable the button if the comment is empty
          }
        });
  }

  maprouletteEditor.error = function(val) {
    if (!arguments.length) return _maprouletteTask;
    _maprouletteTask = val;
    _maprouletteTask.showNoteSaveSection = false;
    return maprouletteEditor;
  };

  return utilRebind(maprouletteEditor, dispatch, 'on');
}
