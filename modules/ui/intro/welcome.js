import { Extent } from '@id-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';

import { helpHtml } from './helper';
import { t } from '../../core/localizer';
import { utilRebind } from '../../util/rebind';


export function uiIntroWelcome(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.welcome.title' };

  const townHallExtent = new Extent([-85.63654,41.94290], [-85.63632,41.94307]);


  // "Welcome! This walkthrough will teach you the basics of editing on OpenStreetMap."
  // Click Ok to advance
  function welcome() {
    const loc = townHallExtent.center();
    context.map().centerZoom(loc, 19);

    curtain.reveal({
      revealSelector: '.intro-nav-wrap .chapter-welcome',
      tipHtml: helpHtml('intro.welcome.welcome'),
      buttonText: t.html('intro.ok'),
      buttonCallback: practice
    });
  }

  // "All of the data in this walkthrough is just for practicing...
  // Click Ok to advance
  function practice() {
    curtain.reveal({
      revealSelector: '.intro-nav-wrap .chapter-welcome',
      tipHtml: helpHtml('intro.welcome.practice'),
      buttonText: t.html('intro.ok'),
      buttonCallback: words
    });
  }

  // "When we introduce a new word, we'll use *italics*."
  // Click Ok to advance
  function words() {
    curtain.reveal({
      revealSelector: '.intro-nav-wrap .chapter-welcome',
      tipHtml: helpHtml('intro.welcome.words'),
      buttonText: t.html('intro.ok'),
      buttonCallback: chapters
    });
  }

  // "You can use the buttons below to skip chapters at any time..."
  // Click on Navigation (or another) chapter to advance
  function chapters() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.intro-nav-wrap .chapter-navigation',
      tipHtml: helpHtml('intro.welcome.chapters', { next: t('intro.navigation.title') })
    });
  }


  chapter.enter = () => {
    welcome();
  };


  chapter.exit = () => {
  };


  chapter.restart = () => {
    chapter.exit();
    chapter.enter();
  };


  return utilRebind(chapter, dispatch, 'on');
}
