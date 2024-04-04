import { Extent } from '@rapid-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';

import { helpHtml } from './helper.js';
import { utilRebind } from '../../util/rebind.js';


export function uiIntroWelcome(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.welcome.title' };
  const townHallExtent = new Extent([-85.63654, 41.94290], [-85.63632, 41.94307]);
  const l10n = context.systems.l10n;
  const map = context.systems.map;

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


  // "Welcome! This walkthrough will teach you the basics of editing on OpenStreetMap."
  // Click Ok to advance
  function welcomeAsync() {
    return map
      .setMapParamsAsync(townHallExtent.center(), 19, 0)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        curtain.reveal({
          revealSelector: '.intro-nav-wrap .chapter-welcome',
          tipHtml: helpHtml(context, 'intro.welcome.welcome'),
          buttonText: l10n.t('intro.ok'),
          buttonCallback: () => resolve(practiceAsync)
        });
      }));
  }

  // "All of the data in this walkthrough is just for practicing...
  // Click Ok to advance
  function practiceAsync() {
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealSelector: '.intro-nav-wrap .chapter-welcome',
        tipHtml: helpHtml(context, 'intro.welcome.practice'),
        buttonText: l10n.t('intro.ok'),
        buttonCallback: () => resolve(wordsAsync)
      });
    });
  }

  // "When we introduce a new word, we'll use *italics*."
  // Click Ok to advance
  function wordsAsync() {
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealSelector: '.intro-nav-wrap .chapter-welcome',
        tipHtml: helpHtml(context, 'intro.welcome.words'),
        buttonText: l10n.t('intro.ok'),
        buttonCallback: () => resolve(chaptersAsync)
      });
    });
  }

  // "You can use the buttons below to skip chapters at any time..."
  // Click on Navigation (or another) chapter to advance
  function chaptersAsync() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.intro-nav-wrap .chapter-navigation',
      tipHtml: helpHtml(context, 'intro.welcome.chapters', { next: l10n.t('intro.navigation.title') })
    });
    return Promise.resolve();
  }


  chapter.enter = () => {
    _chapterCancelled = false;
    _rejectStep = null;

    runAsync(welcomeAsync)
      .catch(e => { if (e instanceof Error) console.error(e); });  // eslint-disable-line no-console
  };


  chapter.exit = () => {
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
