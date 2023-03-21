import { Extent } from '@rapid-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { modeSelect } from '../../modes/select';
import { utilRebind } from '../../util/rebind';
import { delayAsync, eventCancel, helpHtml, icon, transitionTime } from './helper';


export function uiIntroRapid(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.rapid.title' };
  const history = context.history();
  const map = context.map();

  const tulipLaneID = 'w-516';
  const tulipLaneExtent = new Extent([-85.62991, 41.95568], [-85.62700, 41.95638]);

  let _chapterCancelled = false;
  let _rejectStep = null;


  // Helper functions
  // (Note that this returns true whether the way lives in the Rapid graph or OSM graph)
  function _isTulipLaneSelected() {
    if (context.mode().id !== 'select') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === tulipLaneID;
  }

  function _isTulipLaneAccepted() {
    return context.hasEntity(tulipLaneID);
  }


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


  // "This section of the walkthrough will teach you how to use these AI-assisted features..."
  // Click Ok to advance
  function welcomeAsync() {
    context.enter('browse');
    history.reset('initial');

    const loc = tulipLaneExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setCenterZoomAsync(loc, 18.5, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        curtain.reveal({
          revealSelector: '.intro-nav-wrap .chapter-rapid',
          tipHtml: helpHtml('intro.rapid.start', { rapid: icon('#rapid-logo-rapid-wordmark', 'pre-text rapid') }),
          buttonText: t.html('intro.ok'),
          buttonCallback: () => resolve(showHideRoadsAsync)
        });
      }));
  }


  // "AI-assisted features are presented in a magenta-colored overlay..."
  // Click Ok to advance
  function showHideRoadsAsync() {
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealSelector: 'button.rapid-features',
        tipHtml: helpHtml('intro.rapid.ai_roads', { rapid: icon('#rapid-logo-rapid-wordmark', 'pre-text rapid') }),
        buttonText: t.html('intro.ok'),
        buttonCallback: () => resolve(selectRoadAsync)
      });
    });
  }


  // "A single AI-assisted road has shown up on the map. Select the AI-assisted road with a left-click..."
  // Select Tulip Lane to advance
  function selectRoadAsync() {
    context.enter('browse');
    history.reset('initial');
    context.scene().enableLayers('rapid');
    context.ui().togglePanes();   // close issue pane

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      d3_select('.inspector-wrap').on('wheel.intro', eventCancel);  // prevent scrolling

      curtain.reveal({
        revealExtent: tulipLaneExtent,
        tipHtml: helpHtml('intro.rapid.select_road')
      });

      context.on('enter.intro', () => resolve(acceptRoadAsync));
    })
    .finally(() => {
      d3_select('.inspector-wrap').on('wheel.intro', null);
      context.on('enter.intro', null);
    });
  }


  // "Click the 'Use this Feature' button to add the road to the working map..."
  // Accept the feature to advance
  function acceptRoadAsync() {
    return delayAsync()  // after rapid inspector visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_isTulipLaneSelected()) { resolve(); return; }

        curtain.reveal({
          revealSelector: '.rapid-inspector-choice-accept',
          tipHtml: helpHtml('intro.rapid.add_road')
        });

        context.on('enter.intro', resolve);
      }))
      .then(() => {    // check undo annotation to see what the user did
        if (history.undoAnnotation()?.type === 'rapid_accept_feature') {
          return roadAcceptedAsync;
        } else {
          return selectRoadAsync;
        }
      })
      .finally(() => {
        context.on('enter.intro', null);
      });
  }


  // "The AI-assisted road has been added as a change to the map..."
  // Click Ok to advance
  function roadAcceptedAsync() {
    return delayAsync()  // after entity inspector visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_isTulipLaneAccepted()) { resolve(selectRoadAsync); return; }
        if (!_isTulipLaneSelected()) context.enter(modeSelect(context, [tulipLaneID]));

        curtain.reveal({
          revealExtent: tulipLaneExtent,
          tipHtml: helpHtml('intro.rapid.add_road_not_saved_yet', { rapid: icon('#rapid-logo-rapid-wordmark', 'pre-text rapid') }),
          buttonText: t('intro.ok'),
          buttonCallback: () => resolve(showIssuesButtonAsync)
        });

        context.on('enter.intro', reject);   // disallow mode change
      }))
      .finally(() => {
        context.on('enter.intro', null);
      });
  }


  // "Now let's open up the issues panel..."
  // Open Issues panel to advance
  function showIssuesButtonAsync() {
    if (!_isTulipLaneAccepted()) return Promise.resolve(selectRoadAsync);
    if (!_isTulipLaneSelected()) context.enter(modeSelect(context, [tulipLaneID]));

    const issuesButton = d3_select('div.map-control.issues-control > button');

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealNode: issuesButton.node(),
        tipHtml: helpHtml('intro.rapid.open_issues')
      });
      context.on('enter.intro', reject);   // disallow mode change
      issuesButton.on('click.intro', () => resolve(showLintAsync));
    })
    .finally(() => {
      context.on('enter.intro', null);
      issuesButton.on('click.intro', null);
    });
  }


  // "The addition of the road has caused a new issue to appear in the issues panel..."
  // Click Ok to advance
  function showLintAsync() {
    return delayAsync()  // after issues pane visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_isTulipLaneAccepted()) { resolve(selectRoadAsync); return; }
        if (!_isTulipLaneSelected()) context.enter(modeSelect(context, [tulipLaneID]));

        const label = d3_select('li.issue.severity-warning');
        curtain.reveal({
          revealNode: label.node(),   // "connect these features" is expected to be the first child
          revealPadding: 5,
          tipHtml: helpHtml('intro.rapid.new_lints'),
          buttonText: t('intro.ok'),
          buttonCallback: () => resolve(undoRoadAddAsync)
        });
      }));
  }


  // "We could fix the issue by connecting the roads, but let's instead undo..."
  // Click Undo to advance
  function undoRoadAddAsync() {
    if (!_isTulipLaneAccepted()) return Promise.resolve(selectRoadAsync);
    if (!_isTulipLaneSelected()) context.enter(modeSelect(context, [tulipLaneID]));

    const undoButton = d3_select('.top-toolbar button.undo-button');

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealNode: undoButton.node(),
        tipHtml: helpHtml('intro.rapid.undo_road_add', { button: icon('#rapid-icon-undo', 'pre-text') })
      });
      undoButton.on('click.intro', () => resolve(afterUndoRoadAddAsync));
    })
    .finally(() => {
      undoButton.on('click.intro', null);
    });
  }


  // "The road is removed from your local changes, and has returned to the magenta layer as before..."
  // Click Ok to advance
  function afterUndoRoadAddAsync() {
    if (_isTulipLaneAccepted()) return Promise.resolve(selectRoadAsync);  // should be un-accepted now

    context.ui().togglePanes();   // close issue pane

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealExtent: tulipLaneExtent,
        tipHtml: helpHtml('intro.rapid.undo_road_add_aftermath'),
        buttonText: t('intro.ok'),
        buttonCallback: () => resolve(selectRoadAgainAsync)
      });
    });
  }


  // "Next, we'll learn how to ignore roads that you don't want to add..."
  // Select Tulip Lane to advance
  function selectRoadAgainAsync() {
    context.enter('browse');
    history.reset('initial');

    const loc = tulipLaneExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setCenterZoomAsync(loc, 18.5, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        curtain.reveal({
          revealExtent: tulipLaneExtent,
          tipHtml: helpHtml('intro.rapid.select_road_again')
        });

        context.on('enter.intro', () => {
          if (context.selectedIDs().indexOf(tulipLaneID) === -1) return;
          resolve(ignoreRoadAsync);
        });
      }))
      .finally(() => {
        context.on('enter.intro', null);
      });
  }


  // "This time, press the 'Ignore this Feature' button to remove the incorrect road from the working map..."
  // Ignore the road to advance
  function ignoreRoadAsync() {
    return delayAsync()  // after rapid inspector visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_isTulipLaneSelected()) { resolve(); return; }

        curtain.reveal({
          revealSelector: '.rapid-inspector-choice-ignore',
          tipHtml: helpHtml('intro.rapid.ignore_road')
        });

        context.on('enter.intro', resolve);
      }))
      .then(() => {    // check undo annotation to see what the user did
        if (history.undoAnnotation()?.type === 'rapid_ignore_feature') {
          return showHelpAsync;
        } else {
          return selectRoadAgainAsync;
        }
      })
      .finally(() => {
        context.on('enter.intro', null);
      });
  }


  // "Once you have had some practice, be sure to look in the Help button..."
  // Click Ok to advance
  function showHelpAsync() {
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealSelector: '.map-control.help-control',
        tipHtml: helpHtml('intro.rapid.help', {
          rapid: icon('#rapid-logo-rapid-wordmark', 'pre-text rapid'),
          button: icon('#rapid-icon-help', 'pre-text'),
          key: t('help.key')
        }),
        buttonText: t('intro.ok'),
        buttonCallback: () => resolve(playAsync)
      });
    });
  }


  // Free play
  // Click on Start Editing (or another) chapter to advance
  function playAsync() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.ideditor',
      tipSelector: '.intro-nav-wrap .chapter-startEditing',
      tipHtml: helpHtml('intro.rapid.done', { next: t('intro.startediting.title') }),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
    return Promise.resolve();
  }


  chapter.enter = () => {
    context.scene().enableLayers('rapid');
    _chapterCancelled = false;
    _rejectStep = null;

    runAsync(welcomeAsync)
      .catch(e => { if (e instanceof Error) console.error(e); });  // eslint-disable-line no-console
  };


  chapter.exit = () => {
    context.scene().disableLayers('rapid');
    _chapterCancelled = true;

    if (_rejectStep) {   // bail out of whatever step we are in
      _rejectStep();
      _rejectStep = null;
    }
  };


  chapter.restart = () => {
    chapter.exit();
    chapter.enter();
  };


  return utilRebind(chapter, dispatch, 'on');
}
