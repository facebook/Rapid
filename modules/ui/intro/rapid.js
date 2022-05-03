import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { marked } from 'marked';
import { t } from '../../core/localizer';
import { modeBrowse} from '../../modes';
import { utilRebind } from '../../util/rebind';
import { icon, pad, transitionTime } from './helper';


export function uiIntroRapid(context, reveal) {
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
    context.layers().layer('ai-features').enabled(true);
    context.enter(modeBrowse(context));
    context.history().reset('initial');
    reveal('.intro-nav-wrap .chapter-rapid',
      t('intro.rapid.start', { rapid: icon('#iD-logo-rapid', 'pre-text') }),
      { buttonText: t('intro.ok'), buttonCallback: showHideRoads }
    );
  }


  function showHideRoads() {
    const msec = transitionTime(tulipLaneMid, context.map().center());
    if (msec) { reveal(null, null, { duration: 0 }); }
    context.map().centerZoomEase(tulipLaneMid, 18.5, msec);

    reveal(
      'button.rapid-features',
      t('intro.rapid.ai_roads', { rapid: icon('#iD-logo-rapid', 'pre-text') }),
      { buttonText: t('intro.ok'), buttonCallback: selectRoad }
    );
  }


  function selectRoad() {
    context.layers().layer('ai-features').enabled(true);

    // disallow scrolling
    d3_select('.inspector-wrap').on('wheel.intro', eventCancel);
    reveal(tulipLaneBoundingBox(), t('intro.rapid.select_road'));

    timeout(() => {
      let fbRoad = d3_select('.data-layer.ai-features');
      fbRoad.on('click.intro', addRoad);
    }, 250);
  }


  function addRoad() {
    timeout(() => {
      reveal('.rapid-inspector-choice-accept', t('intro.rapid.add_road'));
      let button = d3_select('.choice-button-accept');
      button.on('click.intro', roadAdded);
    }, 250);
  }


  function roadAdded() {
    if (context.mode().id !== 'select') return chapter.restart();

    timeout(() => {
      reveal(tulipLaneBoundingBox(),
        t('intro.rapid.add_road_not_saved_yet', { rapid: icon('#iD-logo-rapid', 'pre-text') }),
        { buttonText: t('intro.ok'), buttonCallback: showLint }
      );
     }, 250);
  }


  function showLint() {
    if (context.mode().id !== 'select') return chapter.restart();

    let button = d3_select('div.issue.severity-warning li.issue-fix-item:first-child > button');
    button.on('click.intro', () => continueTo(fixLint));

    timeout(() => {
      // "connect these features" is expected to be the first child
      reveal('div.issue.severity-warning li.issue-fix-item:first-child',
        t('intro.rapid.new_lints'),
        { buttonText: t('intro.ok'), buttonCallback: () => continueTo(fixLint) }
      );
     }, 250);

    function continueTo(nextStep) {
      button.on('click.intro', null);
      nextStep();
    }
  }


  function fixLint() {
    if (context.mode().id !== 'select') return chapter.restart();

    // "connect these features" is expected to be the first child
    let button = d3_select('div.issue.severity-warning li.issue-fix-item:first-child > button');
    button.on('click.intro', () => continueTo(showFixedRoad));

    timeout(() => {
      reveal('div.issue.severity-warning li.issue-fix-item:first-child',
        t('intro.rapid.fix_lint', { connect: icon('#iD-icon-crossing', 'pre-text') })
      );
    }, 250);

    function continueTo(nextStep) {
      button.on('click.intro', null);
      nextStep();
    }
  }


  function showFixedRoad() {
    if (context.mode().id !== 'select') return chapter.restart();

    timeout(() => {
      reveal(
        tulipLaneEndBoundingBox(),
        t('intro.rapid.fixed_lint'),
        { buttonText: t('intro.ok'), buttonCallback: undoFixLint }
      );
    }, 250);
  }


  function undoFixLint() {
    if (context.mode().id !== 'select') return chapter.restart();

    timeout(() => {
      let button = d3_select('.top-toolbar button.undo-button');
      let iconName = '#iD-icon-undo';
      reveal('.top-toolbar button.undo-button',
        t('intro.rapid.undo_fix_lint', { button: icon(iconName, 'pre-text') })
      );
      button.on('click.intro', undoRoadAdd);
    }, 250);
  }


  function undoRoadAdd() {
    if (context.mode().id !== 'select') return chapter.restart();

    timeout(() => {
      let button = d3_select('.top-toolbar button.undo-button');
      const iconName = '#iD-icon-undo';
      reveal('.top-toolbar button.undo-button',
        t('intro.rapid.undo_road_add', { button: icon(iconName, 'pre-text') })
      );
      button.on('click.intro', afterUndoRoadAdd);
    }, 250);
  }


  function afterUndoRoadAdd() {
    timeout(() => {
      reveal(
        tulipLaneBoundingBox(),
        t('intro.rapid.undo_road_add_aftermath'),
        { buttonText: t('intro.ok'), buttonCallback: selectRoadAgain }
      );
    }, 250);
  }


  function selectRoadAgain() {
    timeout(() => {
      reveal(tulipLaneBoundingBox(), t('intro.rapid.select_road_again'));
      let fbRoad = d3_select('.data-layer.ai-features');
      fbRoad.on('click.intro', ignoreRoad);
    }, 250);
  }


  function ignoreRoad() {
    timeout(() => {
      reveal('.rapid-inspector-choice-ignore', t('intro.rapid.ignore_road'));
      let button = d3_select('.choice-button-ignore');
      button.on('click.intro', showHelp);
    }, 250);
  }


  function showHelp() {
    reveal(
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
    reveal('.intro-nav-wrap .chapter-startEditing',
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
    context.map().on('move.intro-rapid drawn.intro-rapid', null);
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
