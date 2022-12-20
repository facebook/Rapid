import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { helpHtml } from './helper';
import { uiModal } from '../modal';
import { utilRebind } from '../../util/rebind';


export function uiIntroStartEditing(context, curtain) {
  const dispatch = d3_dispatch('done', 'startEditing');
  const chapter = { title: 'intro.startediting.title' };
  const container = context.container();

  let _modalSelection = d3_select(null);


  // "You're now ready to edit OpenStreetMap! You can replay this walkthrough anytime
  // or view more documentation by pressing the help button..."
  // Click Ok to advance
  function showHelp() {
    curtain.reveal({
      revealSelector: '.map-control.help-control',
      tipHtml: helpHtml('intro.startediting.help'),
      buttonText: t.html('intro.ok'),
      buttonCallback: shortcuts
    });
  }


  // "You can view a list of commands along with their keyboard shortcuts by pressing the ? key..."
  // Click Ok to advance
  function shortcuts() {
    curtain.reveal({
      revealSelector: '.map-control.help-control',
      tipHtml: helpHtml('intro.startediting.shortcuts'),
      buttonText: t.html('intro.ok'),
      buttonCallback: showSave
    });
  }


  // "Don't forget to regularly save your changes!"
  // Click Ok to advance
  function showSave() {
    container.selectAll('.shaded').remove();  // in case user opened keyboard shortcuts
    curtain.reveal({
      revealSelector: '.top-toolbar button.save',
      tipHtml: helpHtml('intro.startediting.save'),
      buttonText: t.html('intro.ok'),
      buttonCallback: showStart
    });
  }


  // "Start mapping!"
  // Click the button to advance
  function showStart() {
    container.selectAll('.shaded').remove();  // in case user opened keyboard shortcuts
    _modalSelection = uiModal(container);
    _modalSelection.select('.modal').attr('class', 'modal-splash modal');
    _modalSelection.selectAll('.close').remove();

    const startbutton = _modalSelection.select('.content')
      .attr('class', 'fillL')
      .append('button')
      .attr('class', 'modal-section huge-modal-button')
      .on('click', () => _modalSelection.remove());

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


  chapter.enter = () => {
    showHelp();
  };


  chapter.exit = () => {
    _modalSelection.remove();
    container.selectAll('.shaded').remove();  // in case user opened keyboard shortcuts
  };


  return utilRebind(chapter, dispatch, 'on');
}
