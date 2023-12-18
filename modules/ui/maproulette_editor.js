import { dispatch as d3_dispatch } from 'd3-dispatch';

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
  let _qaItem;


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
      .call(qaHeader.issue(_qaItem))
      .call(qaDetails.issue(_qaItem))
      .call(maprouletteSaveSection);

    const footer = selection.selectAll('.footer')
      .data([0]);

    footer.enter()
      .append('div')
      .attr('class', 'footer')
      .merge(footer)
      .call(uiViewOnMapRoulette(context).what(_qaItem));
  }

  function maprouletteSaveSection(selection) {
    const errID = _qaItem?.id;
    const isSelected = errID && context.selectedData().has(errID);
    const isShown = (_qaItem && isSelected);
    let saveSection = selection.selectAll('.qa-save')
      .data((isShown ? [_qaItem] : []), d => `${d.id}-${d.status || 0}` );

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
      .call(qaSaveButtons);
  }

  function qaSaveButtons(selection) {
    const errID = _qaItem?.id;
    const isSelected = errID && context.selectedData().has(errID);
    let buttonSection = selection.selectAll('.buttons')
      .data((isSelected ? [_qaItem] : []), d => d.status + d.id);

    // exit
    buttonSection.exit()
      .remove();

    // enter
    const buttonEnter = buttonSection.enter()
      .append('div')
      .attr('class', 'buttons');

    // buttonEnter
    //   .append('button')
    //   .attr('class', 'button close-button action');

    // buttonEnter
    //   .append('button')
    //   .attr('class', 'button ignore-button action');

    // update
    buttonSection = buttonSection
      .merge(buttonEnter);

    buttonSection.select('.close-button')
      .html(l10n.tHtml('QA.keepRight.close'))
      .on('click.close', function(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - iD#4641
        if (maproulette) {
          d.newStatus = 'done';
          maproulette.postUpdate(d, (err, item) => dispatch.call('change', item));
        }
      });

    buttonSection.select('.ignore-button')
      .html(l10n.tHtml('QA.keepRight.ignore'))
      .on('click.ignore', function(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - iD#4641
        if (maproulette) {
          d.newStatus = 'false';
          maproulette.postUpdate(d, (err, item) => dispatch.call('change', item));
        }
      });
  }

  maprouletteEditor.error = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return maprouletteEditor;
  };

  return utilRebind(maprouletteEditor, dispatch, 'on');
}
