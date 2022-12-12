import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { modeSelect } from '../../modes/select';
import { marked } from 'marked';
import { t } from '../../core/localizer';
import { utilRebind } from '../../util/rebind';
import { icon, pad, transitionTime } from './helper';


export function uiIntroRapid(context, curtain) {
  const dispatch = d3_dispatch('done');
  let chapter = { title: 'intro.rapid.title' };
  let timeouts = [];

  const tulipLaneStart = [-85.6297512, 41.9561476];
  const tulipLaneMid = [-85.6281089, 41.9561288];
  const tulipLaneEnd = [-85.6272670, 41.9558780];


  function timeout(f, t) {
    timeouts.push(window.setTimeout(f, t));
  }


  function tulipLaneEndBoundingBox(){
    const padding = 70 * Math.pow(2, context.map().zoom() - 18);
    let box = pad(tulipLaneEnd, padding, context);
    box.height = box.height + 65;
    box.width = box.width + 65;
    return box;
  }

  function tulipLaneBoundingBox(){
    const padding = 70 * Math.pow(2, context.map().zoom() - 18);
    let box = pad(tulipLaneStart, padding, context);
    box.height = box.height + 65;
    box.width = box.width + 600;
    return box;
  }


  function eventCancel(d3_event) {
    d3_event.stopPropagation();
    d3_event.preventDefault();
  }


  function welcome() {
    context.scene().enableLayers('rapid');
    context.enter('browse');
    context.history().reset('initial');
    curtain.reveal('.intro-nav-wrap .chapter-rapid',
      t('intro.rapid.start', { rapid: icon('#iD-logo-rapid', 'pre-text') }),
      { buttonText: t('intro.ok'), buttonCallback: showHideRoads }
    );
  }


  function showHideRoads() {
    const msec = transitionTime(tulipLaneMid, context.map().center());
    if (msec) { curtain.reveal(null, null, { duration: 0 }); }
    context.map().centerZoomEase(tulipLaneMid, 18.5, msec);

    curtain.reveal(
      'button.rapid-features',
      t('intro.rapid.ai_roads', { rapid: icon('#iD-logo-rapid', 'pre-text') }),
      { buttonText: t('intro.ok'), buttonCallback: selectRoad }
    );
  }


  function selectRoad() {
    context.scene().enableLayers('rapid');

    // disallow scrolling
    d3_select('.inspector-wrap').on('wheel.intro', eventCancel);
    curtain.reveal(tulipLaneBoundingBox(), t('intro.rapid.select_road'));
    const _fbRoadID = 'w-516';

    context.map().renderer.on('draw', function (mode) {
      if (context.selectedIDs().indexOf(_fbRoadID) === -1) return;
      context.map().renderer.off('draw', null);
      addRoad();
    });
  }


  function addRoad() {
    timeout(() => {
      curtain.reveal('.rapid-inspector-choice-accept', t('intro.rapid.add_road'));
      let button = d3_select('.choice-button-accept');
      button.on('click.intro', roadAdded);
    }, 250);
  }


  function roadAdded() {
    if (context.mode().id !== 'select') return chapter.restart();

    timeout(() => {
      curtain.reveal(tulipLaneBoundingBox(),
        t('intro.rapid.add_road_not_saved_yet', { rapid: icon('#iD-logo-rapid', 'pre-text') }),
        { buttonText: t('intro.ok'), buttonCallback: showIssuesButton }
      );
     }, 250);
  }

  function showIssuesButton() {
    let issuesButton = d3_select('div.map-control.issues-control > button');
    issuesButton.on('click.intro', () => showLint());

    timeout(() => {
      curtain.reveal(issuesButton.node(), t('intro.rapid.open_issues'));
    }, 250);
  }

  function showLint() {
    if (context.mode().id !== 'select') return chapter.restart();

    let label;
    //The timeout is to wait for the issues
    timeout(() => {
      label = d3_select('li.issue.severity-warning');

      // "connect these features" is expected to be the first child
      curtain.reveal(label.node(),
        t('intro.rapid.new_lints'),
        { buttonText: t('intro.ok'), buttonCallback: () => continueTo(undoRoadAdd) }
      );
     }, 250);

    function continueTo(nextStep) {
      nextStep();
    }
  }

  function undoRoadAdd() {
    if (context.mode().id !== 'select') return chapter.restart();

    timeout(() => {
      let button = d3_select('.top-toolbar button.undo-button');
      const iconName = '#iD-icon-undo';
      curtain.reveal('.top-toolbar button.undo-button',
        t('intro.rapid.undo_road_add', { button: icon(iconName, 'pre-text') })
      );
      button.on('click.intro', afterUndoRoadAdd);
    }, 250);
  }


  function afterUndoRoadAdd() {
    timeout(() => {
      curtain.reveal(
        tulipLaneBoundingBox(),
        t('intro.rapid.undo_road_add_aftermath'),
        { buttonText: t('intro.ok'), buttonCallback: selectRoadAgain }
      );
    }, 250);
  }


  function selectRoadAgain() {

    curtain.reveal(tulipLaneBoundingBox(), t('intro.rapid.select_road_again'));
    const _fbRoadID = 'w-516';

    context.map().renderer.on('draw', function (mode) {
      if (context.selectedIDs().indexOf(_fbRoadID) === -1) return;
      context.map().renderer.off('draw', null);
      ignoreRoad();
    });
  }


  function ignoreRoad() {
    timeout(() => {
      curtain.reveal('.rapid-inspector-choice-ignore', t('intro.rapid.ignore_road'));
      let button = d3_select('.choice-button-ignore');
      button.on('click.intro', showHelp);
    }, 250);
  }


  function showHelp() {
    curtain.reveal(
      '.map-control.help-control',
      t('intro.rapid.help', {
        rapid: icon('#iD-logo-rapid', 'pre-text'),
        button: icon('#iD-icon-help', 'pre-text'),
        key: t('help.key')
      }),
      { buttonText: t('intro.ok'), buttonCallback: allDone }
    );
  }


  function allDone() {
    if (context.mode().id !== 'browse') return chapter.restart();

    dispatch.call('done');
    curtain.reveal('.intro-nav-wrap .chapter-startEditing',
      marked.parse(t('intro.rapid.done', { next: t('intro.startediting.title') }))
    );
  }


  chapter.enter = () => {
    welcome();
  };


  chapter.exit = () => {
    timeouts.forEach(window.clearTimeout);
    d3_select(window).on('mousedown.intro-rapid', null, true);
    context.on('enter.intro-rapid exit.intro-rapid', null);
    context.map().off('move draw', null);
    context.history().on('change.intro-rapid', null);
    d3_select('.inspector-wrap').on('wheel.intro-rapid', null);
    d3_select('.preset-list-button').on('click.intro-rapid', null);
  };


  chapter.restart = () => {
    chapter.exit();
    chapter.enter();
  };


  return utilRebind(chapter, dispatch, 'on');
}
