import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { helpHtml } from './helper';
import { uiModal } from '../modal';
import { utilRebind } from '../../util/rebind';


export function uiIntroStartEditing(context, curtain) {
  const dispatch = d3_dispatch('done', 'startEditing');
  let modalSelection = d3_select(null);
  const chapter = {
    title: 'intro.startediting.title'
  };


  function showHelp() {
    curtain.reveal({
      revealSelector: '.map-control.help-control',
      tipHtml: helpHtml('intro.startediting.help'),
      buttonText: t.html('intro.ok'),
      buttonCallback: shortcuts
    });
  }


  function shortcuts() {
    curtain.reveal({
      revealSelector: '.map-control.help-control',
      tipHtml: helpHtml('intro.startediting.shortcuts'),
      buttonText: t.html('intro.ok'),
      buttonCallback: showSave
    });
  }


  function showSave() {
    context.container().selectAll('.shaded').remove();  // in case user opened keyboard shortcuts
    curtain.reveal({
      revealSelector: '.top-toolbar button.save',
      tipHtml: helpHtml('intro.startediting.save'),
      buttonText: t.html('intro.ok'),
      buttonCallback: showStart
    });
  }


  function showStart() {
    context.container().selectAll('.shaded').remove();  // in case user opened keyboard shortcuts
    modalSelection = uiModal(context.container());
    modalSelection.select('.modal').attr('class', 'modal-splash modal');
    modalSelection.selectAll('.close').remove();

    const startbutton = modalSelection.select('.content')
      .attr('class', 'fillL')
      .append('button')
      .attr('class', 'modal-section huge-modal-button')
      .on('click', () => modalSelection.remove());

    startbutton
      .append('svg')
      .attr('class', 'illustration')
      .append('use')
      .attr('xlink:href', '#iD-logo-walkthrough');

    startbutton
      .append('h2')
      .html(t.html('intro.startediting.start'));

    dispatch.call('startEditing');
  }


  chapter.enter = function() {
    showHelp();
  };


  chapter.exit = function() {
    modalSelection.remove();
    context.container().selectAll('.shaded').remove();  // in case user opened keyboard shortcuts
  };


  return utilRebind(chapter, dispatch, 'on');
}
