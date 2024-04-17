import { dispatch as d3_dispatch } from 'd3-dispatch';

import { helpHtml } from './helper.js';
import { uiModal } from '../modal.js';
import { utilRebind } from '../../util/rebind.js';


export function uiIntroStartEditing(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.startediting.title' };
  const container = context.container();
  const l10n = context.systems.l10n;

  let _chapterCancelled = false;
  let _rejectStep = null;


  function runAsync(currStep) {
    if (_chapterCancelled) return Promise.reject();
    if (typeof currStep !== 'function') return Promise.resolve();  // guess we're done

    return currStep()
      .then(nextStep => runAsync(nextStep))   // recurse and advance
      .catch(e => {
        if (e instanceof Error) console.error(e);  // eslint-disable-line no-console
        return runAsync(currStep);   // recurse and retry
      });
  }


  // "You're now ready to edit OpenStreetMap! You can replay this walkthrough anytime
  // or view more documentation by pressing the help button..."
  // Click Ok to advance
  function showHelpAsync() {
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealSelector: '.map-control.help-control',
        tipHtml: helpHtml(context, 'intro.startediting.help'),
        buttonText: l10n.t('intro.ok'),
        buttonCallback: () => resolve(shortcutsAsync)
      });
    });
  }


  // "You can view a list of commands along with their keyboard shortcuts by pressing the ? key..."
  // Click Ok to advance
  function shortcutsAsync() {
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealSelector: '.map-control.help-control',
        tipHtml: helpHtml(context, 'intro.startediting.shortcuts'),
        buttonText: l10n.t('intro.ok'),
        buttonCallback: () => resolve(showSaveAsync)
      });
    });
  }


  // "Don't forget to regularly save your changes!"
  // Click Ok to advance
  function showSaveAsync() {
    container.selectAll('.shaded').remove();  // in case user opened keyboard shortcuts

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealSelector: '.top-toolbar button.save',
        tipHtml: helpHtml(context, 'intro.startediting.save'),
        buttonText: l10n.t('intro.ok'),
        buttonCallback: () => resolve(showStartMappingAsync)
      });
    });
  }


  // "Start mapping!"
  // Click the button to advance
  function showStartMappingAsync() {
    container.selectAll('.shaded').remove();  // in case user opened keyboard shortcuts

    const modalSelection = uiModal(container);
    modalSelection.select('.modal').attr('class', 'modal-splash modal');
    modalSelection.selectAll('.close').remove();

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      const startbutton = modalSelection.select('.content')
        .attr('class', 'fillL')
        .append('button')
        .attr('class', 'modal-section huge-modal-button')
        .on('click', () => {
          resolve();
          dispatch.call('done');
        });

      startbutton
        .append('svg')
        .attr('class', 'illustration')
        .append('use')
        .attr('xlink:href', '#rapid-logo-walkthrough');

      startbutton
        .append('h2')
        .html(l10n.tHtml('intro.startediting.start'));
    })
    .finally(() => {
      modalSelection.remove();
    });
  }


  chapter.enter = () => {
    _chapterCancelled = false;
    _rejectStep = null;

    runAsync(showHelpAsync)
      .catch(e => { if (e instanceof Error) console.error(e); });  // eslint-disable-line no-console
  };


  chapter.exit = () => {
    container.selectAll('.shaded').remove();  // in case user opened keyboard shortcuts
    _chapterCancelled = true;

    if (_rejectStep) {   // bail out of whatever step we are in
      _rejectStep();
      _rejectStep = null;
    }
  };


  return utilRebind(chapter, dispatch, 'on');
}
