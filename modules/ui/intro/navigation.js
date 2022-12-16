import { Extent, vecEqual } from '@id-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { presetManager } from '../../presets';
import { t } from '../../core/localizer';
import { modeSelect } from '../../modes/select';
import { utilRebind } from '../../util/rebind';
import { helpHtml, icon, /*pointBox,*/ transitionTime } from './helper';


export function uiIntroNavigation(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = {
    title: 'intro.navigation.title'
  };

  const hallID = 'n2061';
  const townHall = [-85.63591, 41.94285];
  const springStreetID = 'w397';
  const springStreetEndID = 'n1834';
  const springStreet = [-85.63582, 41.94255];
  const onewayField = presetManager.field('oneway');
  const maxspeedField = presetManager.field('maxspeed');
  let timeouts = [];


  function timeout(fn, t) {
    timeouts.push(window.setTimeout(fn, t));
  }


  function eventCancel(d3_event) {
    d3_event.stopPropagation();
    d3_event.preventDefault();
  }


  function isTownHallSelected() {
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === hallID;
  }


  function dragMap() {
    context.enter('browse');
    context.history().reset('initial');

    const msec = transitionTime(townHall, context.map().center());
    context.map().centerZoomEase(townHall, 19, msec);

    timeout(() => {
      const centerStart = context.map().center();
      const textID = context.lastPointerType() === 'mouse' ? 'drag' : 'drag_touch';
      const dragString = helpHtml('intro.navigation.map_info') + '{br}' + helpHtml(`intro.navigation.${textID}`);

      const checkDrag = () => {
        if (vecEqual(centerStart, context.map().center())) return;  // no change
        context.map().off('move', checkDrag);
        timeout(zoomMap, 2000);
      };

      curtain.reveal({
        revealSelector: '.surface',
        tipHtml: dragString
      });

      context.map().on('move', checkDrag);

    }, msec + 100);
  }


  function zoomMap() {
    const zoomStart = context.map().zoom();
    const textID = context.lastPointerType() === 'mouse' ? 'zoom' : 'zoom_touch';
    const zoomString = helpHtml(`intro.navigation.${textID}`);

    const checkZoom = () => {
      if (zoomStart === context.map().zoom()) return;  // no change
      context.map().off('move', checkZoom);
      timeout(features, 2000);
    };

    curtain.reveal({
      revealSelector: '.surface',
      tipHtml: zoomString
    });

    context.map().on('move', checkZoom);
  }


  function features() {
    curtain.reveal({
      revealSelector: '.surface',
      tipHtml: helpHtml('intro.navigation.features'),
      buttonText: t.html('intro.ok'),
      buttonCallback: pointsLinesAreas
    });
  }


  function pointsLinesAreas() {
    curtain.reveal({
      revealSelector: '.surface',
      tipHtml: helpHtml('intro.navigation.points_lines_areas'),
      buttonText: t.html('intro.ok'),
      buttonCallback: nodesWays
    });
  }


  function nodesWays() {
    curtain.reveal({
      revealSelector: '.surface',
      tipHtml: helpHtml('intro.navigation.nodes_ways'),
      buttonText: t.html('intro.ok'),
      buttonCallback: clickTownHall
    });
  }


  function clickTownHall() {
    context.enter('browse');
    context.history().reset('initial');

    const entity = context.hasEntity(hallID);
    if (!entity) return;
    context.map().centerZoomEase(entity.loc, 19, 500);

    timeout(() => {
      const entity = context.hasEntity(hallID);
      if (!entity) return;

      const textID = context.lastPointerType() === 'mouse' ? 'click_townhall' : 'tap_townhall';

      curtain.reveal({
        revealExtent: new Extent(entity.loc).padByMeters(20),
        tipHtml: helpHtml(`intro.navigation.${textID}`)
      });

      context.on('enter.intro', () => {
        if (isTownHallSelected()) {
          continueTo(selectedTownHall);
        }
      });

    }, 550);  // after centerZoomEase

    context.history().on('change.intro', () => {
      if (!context.hasEntity(hallID)) {
        continueTo(clickTownHall);
      }
    });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      context.history().on('change.intro', null);
      nextStep();
    }
  }


  function selectedTownHall() {
    if (!isTownHallSelected()) return clickTownHall();

    const entity = context.hasEntity(hallID);
    if (!entity) return clickTownHall();

    const onClick = () => { continueTo(editorTownHall); };

    curtain.reveal({
      revealExtent: new Extent(entity.loc).padByMeters(20),
      tipHtml: helpHtml('intro.navigation.selected_townhall'),
      buttonText: t.html('intro.ok'),
      buttonCallback: onClick
    });

    context.history().on('change.intro', () => {
      if (!context.hasEntity(hallID)) {
        continueTo(clickTownHall);
      }
    });

    function continueTo(nextStep) {
      context.history().on('change.intro', null);
      nextStep();
    }
  }


  function editorTownHall() {
    if (!isTownHallSelected()) return clickTownHall();

    // disallow scrolling
    context.container().select('.inspector-wrap').on('wheel.intro', eventCancel);

    const onClick = () => { continueTo(presetTownHall); };

    curtain.reveal({
      revealSelector: '.entity-editor-pane',
      tipHtml: helpHtml('intro.navigation.editor_townhall'),
      buttonText: t.html('intro.ok'),
      buttonCallback: onClick
    });

    context.on('exit.intro', () => {
      continueTo(clickTownHall);
    });

    context.history().on('change.intro', () => {
      if (!context.hasEntity(hallID)) {
        continueTo(clickTownHall);
      }
    });

    function continueTo(nextStep) {
      context.on('exit.intro', null);
      context.history().on('change.intro', null);
      context.container().select('.inspector-wrap').on('wheel.intro', null);
      nextStep();
    }
  }


  function presetTownHall() {
    if (!isTownHallSelected()) return clickTownHall();

    // reset pane, in case user happened to change it..
    context.container().select('.inspector-wrap .panewrap').style('right', '0%');
    // disallow scrolling
    context.container().select('.inspector-wrap').on('wheel.intro', eventCancel);

    // preset match, in case the user happened to change it.
    const entity = context.entity(context.selectedIDs()[0]);
    const preset = presetManager.match(entity, context.graph());

    const onClick = () => { continueTo(fieldsTownHall); };

    curtain.reveal({
      revealSelector: '.entity-editor-pane .section-feature-type',
      revealPadding: 5,
      tipHtml: helpHtml('intro.navigation.preset_townhall', { preset: preset.name() }),
      buttonText: t.html('intro.ok'),
      buttonCallback: onClick
    });

    context.on('exit.intro', () => {
      continueTo(clickTownHall);
    });

    context.history().on('change.intro', () => {
      if (!context.hasEntity(hallID)) {
        continueTo(clickTownHall);
      }
    });

    function continueTo(nextStep) {
      context.on('exit.intro', null);
      context.history().on('change.intro', null);
      context.container().select('.inspector-wrap').on('wheel.intro', null);
      nextStep();
    }
  }


  function fieldsTownHall() {
    if (!isTownHallSelected()) return clickTownHall();

    // reset pane, in case user happened to change it..
    context.container().select('.inspector-wrap .panewrap').style('right', '0%');
    // disallow scrolling
    context.container().select('.inspector-wrap').on('wheel.intro', eventCancel);

    const onClick = () => { continueTo(closeTownHall); };

    curtain.reveal({
      revealSelector: '.entity-editor-pane .section-preset-fields',
      revealPadding: 5,
      tipHtml: helpHtml('intro.navigation.fields_townhall'),
      buttonText: t.html('intro.ok'),
      buttonCallback: onClick
    });

    context.on('exit.intro', () => {
      continueTo(clickTownHall);
    });

    context.history().on('change.intro', () => {
      if (!context.hasEntity(hallID)) {
        continueTo(clickTownHall);
      }
    });

    function continueTo(nextStep) {
      context.on('exit.intro', null);
      context.history().on('change.intro', null);
      context.container().select('.inspector-wrap').on('wheel.intro', null);
      nextStep();
    }
  }


  function closeTownHall() {
    if (!isTownHallSelected()) return clickTownHall();

    const selector = '.entity-editor-pane button.close svg use';
    const href = d3_select(selector).attr('href') || '#iD-icon-close';

    curtain.reveal({
      revealSelector: '.entity-editor-pane',
      tipHtml: helpHtml('intro.navigation.close_townhall', { button: icon(href, 'inline') })
    });

    context.on('exit.intro', () => {
      continueTo(searchStreet);
    });

    context.history().on('change.intro', () => {
      // update the close icon in the tooltip if the user edits something.
      const selector = '.entity-editor-pane button.close svg use';
      const href = d3_select(selector).attr('href') || '#iD-icon-close';

      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.navigation.close_townhall', { button: icon(href, 'inline') })
      });
    });

    function continueTo(nextStep) {
      context.on('exit.intro', null);
      context.history().on('change.intro', null);
      nextStep();
    }
  }


  function searchStreet() {
    context.enter('browse');
    context.history().reset('initial');  // ensure spring street exists

    const msec = transitionTime(springStreet, context.map().center());
    context.map().centerZoomEase(springStreet, 19, msec);  // ..and user can see it

    timeout(() => {
      curtain.reveal({
        revealSelector: '.search-header input',
        tipHtml: helpHtml('intro.navigation.search_street', { name: t('intro.graph.name.spring-street') })
      });

      context.container().select('.search-header input')
        .on('keyup.intro', checkSearchResult);
    }, msec + 100);
  }


  function checkSearchResult() {
    const first = context.container().select('.feature-list-item:nth-child(0n+2)');  // skip "No Results" item
    const firstName = first.select('.entity-name');
    const name = t('intro.graph.name.spring-street');

    if (!firstName.empty() && firstName.html() === name) {
      curtain.reveal({
        revealNode: first.node(),
        tipHtml: helpHtml('intro.navigation.choose_street', { name: name }),
        duration: 300
      });

      context.on('exit.intro', () => {
        continueTo(selectedStreet);
      });

      context.container().select('.search-header input')
        .on('keydown.intro', eventCancel, true)
        .on('keyup.intro', null);
    }

    function continueTo(nextStep) {
      context.on('exit.intro', null);
      context.container().select('.search-header input')
        .on('keydown.intro', null)
        .on('keyup.intro', null);
      nextStep();
    }
  }


  function selectedStreet() {
    if (!context.hasEntity(springStreetEndID) || !context.hasEntity(springStreetID)) {
        return searchStreet();
    }

    const onClick = () => { continueTo(editorStreet); };
    const entity = context.entity(springStreetEndID);
//        const box = pointBox(entity.loc, context);
//        box.height = 500;

    curtain.reveal({
      revealExtent: new Extent(entity.loc),
      revealPadding: 40,
      tipHtml: helpHtml('intro.navigation.selected_street', { name: t('intro.graph.name.spring-street') }),
      buttonText: t.html('intro.ok'),
      buttonCallback: onClick,
      duration: 600
    });

    context.on('enter.intro', mode => {
      if (!context.hasEntity(springStreetID)) {
        return continueTo(searchStreet);
      }
      const ids = context.selectedIDs();
      if (mode.id !== 'select' || !ids.length || ids[0] !== springStreetID) {
        // keep Spring Street selected..
        context.enter(modeSelect(context, [springStreetID]));
      }
    });

    context.history().on('change.intro', () => {
      if (!context.hasEntity(springStreetEndID) || !context.hasEntity(springStreetID)) {
        timeout(() => continueTo(searchStreet), 300);  // after any transition (e.g. if user deleted intersection)
      }
    });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      context.history().on('change.intro', null);
      nextStep();
    }
  }


  function editorStreet() {
    const selector = '.entity-editor-pane button.close svg use';
    const href = d3_select(selector).attr('href') || '#iD-icon-close';
    const tipHtml = helpHtml('intro.navigation.street_different_fields') + '{br}' +
      helpHtml('intro.navigation.editor_street', {
        button: icon(href, 'inline'),
        field1: onewayField.label(),
        field2: maxspeedField.label()
      });

    curtain.reveal({
      revealSelector: '.entity-editor-pane',
      tipHtml: tipHtml
    });

    context.on('exit.intro', () => {
      continueTo(play);
    });

    context.history().on('change.intro', () => {
      // update the close icon in the tooltip if the user edits something.
      const selector = '.entity-editor-pane button.close svg use';
      const href = d3_select(selector).attr('href') || '#iD-icon-close';
      const tipHtml = helpHtml('intro.navigation.street_different_fields') + '{br}' +
        helpHtml('intro.navigation.editor_street', {
          button: icon(href, 'inline'),
          field1: onewayField.label(),
          field2: maxspeedField.label()
        });

      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: tipHtml
      });
    });

    function continueTo(nextStep) {
      context.on('exit.intro', null);
      context.history().on('change.intro', null);
      nextStep();
    }
  }


  function play() {
    dispatch.call('done');

    curtain.reveal({
      revealSelector: '.ideditor',
      tipSelector: '.intro-nav-wrap .chapter-point',
      tipHtml: helpHtml('intro.navigation.play', { next: t('intro.points.title') }),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => {
        curtain.reveal({ revealSelector: '.ideditor' });  // re-reveal but without the tooltip
      }
    });
  }


  chapter.enter = () => {
    dragMap();
  };


  chapter.exit = () => {
    timeouts.forEach(window.clearTimeout);
    context.on('enter.intro exit.intro', null);
    context.history().on('change.intro', null);
    context.container().select('.inspector-wrap').on('wheel.intro', null);
    context.container().select('.search-header input').on('keydown.intro keyup.intro', null);
  };


  chapter.restart = () => {
    chapter.exit();
    chapter.enter();
  };


  return utilRebind(chapter, dispatch, 'on');
}
