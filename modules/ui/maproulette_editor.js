import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { uiIcon } from './icon';

import { uiMapRouletteDetails } from './maproulette_details';
import { uiMapRouletteHeader } from './maproulette_header';
import { uiViewOnMapRoulette } from './view_on_maproulette';
import { utilRebind } from '../util';


export function uiMapRouletteEditor(context) {
  const l10n = context.systems.l10n;
  const maproulette = context.services.maproulette;
  const dispatch = d3_dispatch('change');
  const qaDetails = uiMapRouletteDetails(context);
  const qaHeader = uiMapRouletteHeader(context);
  // let _qaItem;
  let _maprouletteTask;


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
      .html(l10n.tHtml('QA.maproulette.title'));

    let body = selection.selectAll('.body')
      .data([0]);

    body = body.enter()
      .append('div')
      .attr('class', 'body')
      .merge(body);

    let editor = body.selectAll('.qa-editor')
      .data([0]);

    editor.enter()
      .append('div')
      .attr('class', 'modal-section qa-editor')
      .merge(editor)
      .call(qaHeader.issue(_maprouletteTask))
      .call(qaDetails.issue(_maprouletteTask))
      .call(maprouletteSaveSection);

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
    let saveSection = selection.selectAll('.qa-save')
      .data((isShown ? [_maprouletteTask] : []), d => `${d.id}-${d.status || 0}` );

    // exit
    saveSection.exit()
      .remove();

    // enter
    const saveSectionEnter = saveSection.enter()
      .append('div')
      .attr('class', 'qa-save save-section cf');

    // update
    saveSection = saveSectionEnter
      .merge(saveSection)
      .call(userDetails)
      .call(qaSaveButtons);
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
            .html(l10n.tHtml('QA.maproulette.login'));

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

  function qaSaveButtons(selection) {
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
      .html(l10n.tHtml('QA.maproulette.fixedIt'))
      .on('click.close', function(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - iD#4641
        if (maproulette) {
          d.newStatus = 'done';
          maproulette.postUpdate(d, (err, item) => dispatch.call('change', item));
        }
      });

    buttonSection.select('.cantComplete-button')
      .attr('disabled', isSaveDisabled(_maprouletteTask))
      .html(l10n.tHtml('QA.maproulette.cantComplete'))
      .on('click.ignore', function(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - iD#4641
        if (maproulette) {
          d.newStatus = 'false';
          maproulette.postUpdate(d, (err, item) => dispatch.call('change', item));
        }
      });

    buttonSection.select('.alreadyFixed-button')
      .attr('disabled', isSaveDisabled(_maprouletteTask))
      .html(l10n.tHtml('QA.maproulette.alreadyFixed'))
      .on('click.ignore', function(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - iD#4641
        if (maproulette) {
          d.newStatus = 'false';
          maproulette.postUpdate(d, (err, item) => dispatch.call('change', item));
        }
      });

    buttonSection.select('.notAnIssue-button')
      .attr('disabled', isSaveDisabled(_maprouletteTask))
      .html(l10n.tHtml('QA.maproulette.notAnIssue'))
      .on('click.ignore', function(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - iD#4641
        if (maproulette) {
          d.newStatus = 'false';
          maproulette.postUpdate(d, (err, item) => dispatch.call('change', item));
        }
      });


    function isSaveDisabled(d) {
      return (hasAuth && d.service === 'maproulette') ? null : true;
    }
  }

  maprouletteEditor.error = function(val) {
    if (!arguments.length) return _maprouletteTask;
    _maprouletteTask = val;
    return maprouletteEditor;
  };

  return utilRebind(maprouletteEditor, dispatch, 'on');
}
