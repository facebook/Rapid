import { Extent } from '@id-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { utilRebind } from '../../util/rebind';
import { helpHtml, icon, transitionTime } from './helper';


export function uiIntroRapid(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.rapid.title' };
  const history = context.history();
  const map = context.map();

  const tulipLaneID = 'w-516';
  const tulipLaneExtent = new Extent([-85.62991, 41.95568], [-85.62700, 41.95638]);

  let _timeouts = [];


  function timeout(fn, t) {
    _timeouts.push(window.setTimeout(fn, t));
  }


  function eventCancel(d3_event) {
    d3_event.stopPropagation();
    d3_event.preventDefault();
  }


  // "This section of the walkthrough will teach you how to use these AI-assisted features..."
  // Click Ok to advance
  function welcome() {
    context.scene().enableLayers('rapid');
    context.enter('browse');
    history.reset('initial');

    const loc = tulipLaneExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();
    map.centerZoomEase(loc, 18.5, msec);

    timeout(() => {
      curtain.reveal({
        revealSelector: '.intro-nav-wrap .chapter-rapid',
        tipHtml: helpHtml('intro.rapid.start', { rapid: icon('#iD-logo-rapid', 'pre-text') }),
        buttonText: t.html('intro.ok'),
        buttonCallback: showHideRoads
      });
    }, msec + 100);
  }


  // "AI-assisted features are presented in a magenta-colored overlay..."
  // Click Ok to advance
  function showHideRoads() {
    curtain.reveal({
      revealSelector: 'button.rapid-features',
      tipHtml: helpHtml('intro.rapid.ai_roads', { rapid: icon('#iD-logo-rapid', 'pre-text') }),
      buttonText: t.html('intro.ok'),
      buttonCallback: selectRoad
    });
  }


  // "A single AI-assisted road has shown up on the map. Select the AI-assisted road with a left-click..."
  // Select Tulip Lane to advance
  function selectRoad() {
    context.scene().enableLayers('rapid');

    d3_select('.inspector-wrap').on('wheel.intro', eventCancel);  // disallow scrolling

    curtain.reveal({
      revealExtent: tulipLaneExtent,
      tipHtml: helpHtml('intro.rapid.select_road')
    });

    context.on('enter.intro', () => {
      if (context.selectedIDs().indexOf(tulipLaneID) === -1) return;
      continueTo(addRoad);
    });

    function continueTo(nextStep) {
      d3_select('.inspector-wrap').on('wheel.intro', null);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Click the 'Use this Feature' button to add the road to the working map..."
  // Accept the feature to advance
  function addRoad() {
    timeout(() => {
      curtain.reveal({
        revealSelector: '.rapid-inspector-choice-accept',
        tipHtml: helpHtml('intro.rapid.add_road')
      });
      d3_select('.choice-button-accept').on('click.intro', () => continueTo(roadAdded));
    }, 250);

    function continueTo(nextStep) {
      d3_select('.choice-button-accept').on('click.intro', null);
      nextStep();
    }
  }


  // "The AI-assisted road has been added as a change to the map..."
  // Click Ok to advance
  function roadAdded() {
    if (context.mode().id !== 'select') return chapter.restart();

    timeout(() => {
      curtain.reveal({
        revealExtent: tulipLaneExtent,
        tipHtml: helpHtml('intro.rapid.add_road_not_saved_yet', { rapid: icon('#iD-logo-rapid', 'pre-text') }),
        buttonText: t('intro.ok'),
        buttonCallback: showIssuesButton
      });
     }, 250);
  }


  // "Now let's open up the issues panel..."
  // Open Issues panel to advance
  function showIssuesButton() {
    const issuesButton = d3_select('div.map-control.issues-control > button');

    timeout(() => {
      curtain.reveal({
        revealNode: issuesButton.node(),
        tipHtml: helpHtml('intro.rapid.open_issues')
      });
    }, 250);

    issuesButton.on('click.intro', () => continueTo(showLint));

    function continueTo(nextStep) {
      issuesButton.on('click.intro', null);
      nextStep();
    }
  }


  // "The addition of the road has caused a new issue to appear in the issues panel..."
  // Click Ok to advance
  function showLint() {
    if (context.mode().id !== 'select') return chapter.restart();

    // The timeout is to wait for the issues
    timeout(() => {
      const label = d3_select('li.issue.severity-warning');
      curtain.reveal({
        revealNode: label.node(),   // "connect these features" is expected to be the first child
        tipHtml: helpHtml('intro.rapid.new_lints'),
        buttonText: t('intro.ok'),
        buttonCallback: undoRoadAdd
      });
     }, 250);
  }


  // "We could fix the issue by connecting the roads, but let's instead undo..."
  // Click Undo to advance
  function undoRoadAdd() {
    if (context.mode().id !== 'select') return chapter.restart();

    const button = d3_select('.top-toolbar button.undo-button');

    timeout(() => {
      button.on('click.intro', () => continueTo(afterUndoRoadAdd));

      curtain.reveal({
        revealNode: button.node(),
        tipHtml: helpHtml('intro.rapid.undo_road_add', { button: icon('#iD-icon-undo', 'pre-text') })
      });
    }, 250);

    function continueTo(nextStep) {
      button.on('click.intro', null);
      nextStep();
    }
  }


  // "The road is removed from your local changes, and has returned to the magenta layer as before..."
  // Click Ok to advance
  function afterUndoRoadAdd() {
    curtain.reveal({
      revealExtent: tulipLaneExtent,
      tipHtml: helpHtml('intro.rapid.undo_road_add_aftermath'),
      buttonText: t('intro.ok'),
      buttonCallback: selectRoadAgain
    });
  }


  // "Next, we'll learn how to ignore roads that you don't want to add..."
  // Select Tulip Lane to advance
  function selectRoadAgain() {
    curtain.reveal({
      revealExtent: tulipLaneExtent,
      tipHtml: helpHtml('intro.rapid.select_road_again')
    });

    context.on('enter.intro', () => {
      if (context.selectedIDs().indexOf(tulipLaneID) === -1) return;
      continueTo(ignoreRoad);
    });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "This time, press the 'Ignore this Feature' button to remove the incorrect road from the working map..."
  // Ignore the road to advance
  function ignoreRoad() {
    timeout(() => {
      d3_select('.choice-button-ignore').on('click.intro', () => continueTo(showHelp));

      curtain.reveal({
        revealSelector: '.rapid-inspector-choice-ignore',
        tipHtml: helpHtml('intro.rapid.ignore_road')
      });
    }, 250);

    function continueTo(nextStep) {
      d3_select('.choice-button-ignore').on('click.intro', null);
      nextStep();
    }
  }


  // "Once you have had some practice, be sure to look in the Help button..."
  // Click Ok to advance
  function showHelp() {
    curtain.reveal({
      revealSelector: '.map-control.help-control',
      tipHtml: helpHtml('intro.rapid.help', {
        rapid: icon('#iD-logo-rapid', 'pre-text'),
        button: icon('#iD-icon-help', 'pre-text'),
        key: t('help.key')
      }),
      buttonText: t('intro.ok'),
      buttonCallback: allDone
    });
  }


  // Free play
  // Click on Start Editing (or another) chapter to advance
  function allDone() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.ideditor',
      tipSelector: '.intro-nav-wrap .chapter-startEditing',
      tipHtml: helpHtml('intro.rapid.done', { next: t('intro.startediting.title') }),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
  }


  chapter.enter = () => {
    welcome();
  };


  chapter.exit = () => {
    _timeouts.forEach(window.clearTimeout);
    context.on('enter.intro', null);
    d3_select('.inspector-wrap').on('wheel.intro', null);
    d3_select('.choice-button-accept').on('click.intro', null);
    d3_select('.choice-button-ignore').on('click.intro', null);
  };


  chapter.restart = () => {
    chapter.exit();
    chapter.enter();
  };


  return utilRebind(chapter, dispatch, 'on');
}
