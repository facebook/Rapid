import { Extent, vecEqual } from '@id-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { presetManager } from '../../presets';
import { t } from '../../core/localizer';
import { utilRebind } from '../../util/rebind';
import { helpHtml, icon, transitionTime } from './helper';


export function uiIntroNavigation(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.navigation.title' };
  const container = context.container();
  const history = context.history();
  const map = context.map();

  const townHallID = 'n2061';
  const townHallExtent = new Extent([-85.63654, 41.94290], [-85.63632, 41.94307]);
  const springStreetID = 'w397';
  const springStreetExtent = new Extent([-85.63588, 41.94155], [-85.63574, 41.94278]);
  const onewayField = presetManager.field('oneway');
  const maxspeedField = presetManager.field('maxspeed');

  let _timeouts = [];
  let _onMove = null;


  function timeout(fn, t) {
    _timeouts.push(window.setTimeout(fn, t));
  }


  function eventCancel(d3_event) {
    d3_event.stopPropagation();
    d3_event.preventDefault();
  }


  // Helper function to make sure the Town Hall exists _and_ is selected
  function _isTownHallSelected() {
    if (!context.hasEntity(townHallID)) return false;
    if (context.mode().id !== 'select') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === townHallID;
  }

  // Helper function to make sure the Spring Street exists
  function _doesSpringStreetExist() {
    return context.hasEntity(springStreetID);
  }

  // Helper function to make sure Spring Street exists _and_ is selected
  function _isSpringStreetSelected() {
    if (!context.hasEntity(springStreetID)) return false;
    if (context.mode().id !== 'select') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === springStreetID;
  }

  // Helper function to force the entity inspector open
  // These things happen automatically but we want to be sure
  function _showEntityEditor() {
    container.select('.inspector-wrap .entity-editor-pane').classed('hide', false);
    container.select('.inspector-wrap .panewrap').style('right', '0%');
  }


  // "The main map area shows OpenStreetMap data on top of a background."
  // Drag the map to advance
  function dragMap() {
    context.enter('browse');
    history.reset('initial');

    const loc = townHallExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    map
      .setCenterZoomAsync(loc, 19, msec)
      .then(() => {
        const centerStart = map.center();
        const textID = context.lastPointerType() === 'mouse' ? 'drag' : 'drag_touch';
        const dragString = helpHtml('intro.navigation.map_info') + '{br}' + helpHtml(`intro.navigation.${textID}`);

        _onMove = () => {
          if (vecEqual(centerStart, map.center())) return;  // no change
          map.off('move', _onMove);
          timeout(zoomMap, 2000);
        };

        curtain.reveal({
          revealSelector: '.main-map',
          tipHtml: dragString
        });

        map.on('move', _onMove);
      });
  }


  // Zoom the map to advance
  function zoomMap() {
    const zoomStart = map.zoom();
    const textID = context.lastPointerType() === 'mouse' ? 'zoom' : 'zoom_touch';
    const zoomString = helpHtml(`intro.navigation.${textID}`);

    _onMove = () => {
      if (zoomStart === map.zoom()) return;  // no change
      map.off('move', _onMove);
      timeout(features, 2000);
    };

    curtain.reveal({
      revealSelector: '.main-map',
      tipHtml: zoomString
    });

    map.on('move', _onMove);
  }


  // "We use the word *features* to describe the things that appear on the map..."
  // Click Ok to advance
  function features() {
    curtain.reveal({
      revealSelector: '.main-map',
      tipHtml: helpHtml('intro.navigation.features'),
      buttonText: t.html('intro.ok'),
      buttonCallback: pointsLinesAreas
    });
  }


  // "Map features are represented using points, lines, or areas..."
  // Click Ok to advance
  function pointsLinesAreas() {
    curtain.reveal({
      revealSelector: '.main-map',
      tipHtml: helpHtml('intro.navigation.points_lines_areas'),
      buttonText: t.html('intro.ok'),
      buttonCallback: nodesWays
    });
  }


  // "Points are sometimes called nodes and lines and areas are sometimes called ways..."
  // Click Ok to advance
  function nodesWays() {
    curtain.reveal({
      revealSelector: '.main-map',
      tipHtml: helpHtml('intro.navigation.nodes_ways'),
      buttonText: t.html('intro.ok'),
      buttonCallback: clickTownHall
    });
  }


  // Select the town hall to advance
  function clickTownHall() {
    context.enter('browse');
    history.reset('initial');

    const loc = townHallExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    map
      .setCenterZoomAsync(loc, 19, msec)
      .then(() => {
        const entity = context.hasEntity(townHallID);
        if (!entity) return;

        const textID = context.lastPointerType() === 'mouse' ? 'click_townhall' : 'tap_townhall';
        curtain.reveal({
          revealExtent: townHallExtent,
          tipHtml: helpHtml(`intro.navigation.${textID}`)
        });
      });

    context.on('enter.intro', () => continueTo(selectedTownHall));

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Great! The point is now selected..."
  // Click Ok to advance
  function selectedTownHall() {
    if (!_isTownHallSelected()) return clickTownHall();

    curtain.reveal({
      revealExtent: townHallExtent,
      tipHtml: helpHtml('intro.navigation.selected_townhall'),
      buttonText: t.html('intro.ok'),
      buttonCallback: editorTownHall
    });
  }


  // "When a feature is selected, the feature editor is displayed alongside the map."
  // Click Ok to advance
  function editorTownHall() {
    if (!_isTownHallSelected()) return clickTownHall();

    _showEntityEditor();
    container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // disallow scrolling

    curtain.reveal({
      revealSelector: '.entity-editor-pane',
      tipHtml: helpHtml('intro.navigation.editor_townhall'),
      buttonText: t.html('intro.ok'),
      buttonCallback:  () => continueTo(presetTownHall)
    });

    function continueTo(nextStep) {
      container.select('.inspector-wrap').on('wheel.intro', null);
      nextStep();
    }
  }


  // "The top part of the feature editor shows the feature's type."
  // Click Ok to advance
  function presetTownHall() {
    if (!_isTownHallSelected()) return clickTownHall();

    _showEntityEditor();
    container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // disallow scrolling

    // preset match, in case the user happened to change it.
    const entity = context.entity(context.selectedIDs()[0]);
    const preset = presetManager.match(entity, context.graph());

    curtain.reveal({
      revealSelector: '.entity-editor-pane .section-feature-type',
      revealPadding: 5,
      tipHtml: helpHtml('intro.navigation.preset_townhall', { preset: preset.name() }),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => continueTo(fieldsTownHall)
    });

    function continueTo(nextStep) {
      container.select('.inspector-wrap').on('wheel.intro', null);
      nextStep();
    }
  }


  // "The middle part of the feature editor contains fields..."
  // Click Ok to advance
  function fieldsTownHall() {
    if (!_isTownHallSelected()) return clickTownHall();

    _showEntityEditor();
    container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // disallow scrolling

    curtain.reveal({
      revealSelector: '.entity-editor-pane .section-preset-fields',
      revealPadding: 5,
      tipHtml: helpHtml('intro.navigation.fields_townhall'),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => continueTo(closeTownHall)
    });

    function continueTo(nextStep) {
      container.select('.inspector-wrap').on('wheel.intro', null);
      nextStep();
    }
  }


  // Close entity editor / leave select mode to advance
  function closeTownHall() {
    if (!_isTownHallSelected()) return clickTownHall();

    _showEntityEditor();
    const iconSelector = '.entity-editor-pane button.close svg use';
    const iconName = d3_select(iconSelector).attr('href') || '#iD-icon-close';
    curtain.reveal({
      revealSelector: '.entity-editor-pane',
      tipSelector: '.entity-editor-pane button.close',
      tipHtml: helpHtml('intro.navigation.close_townhall', { button: icon(iconName, 'inline') })
    });

    context.on('enter.intro', () => continueTo(searchStreet));

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "You can also search for features in the current view, or worldwide.
  // Search for Spring Street to advance
  function searchStreet() {
    context.enter('browse');
    history.reset('initial');  // ensure spring street exists

    const loc = springStreetExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    map
      .setCenterZoomAsync(loc, 19, msec)
      .then(() => {
        curtain.reveal({
          revealSelector: '.search-header input',
          revealPadding: 5,
          tipHtml: helpHtml('intro.navigation.search_street', { name: t('intro.graph.name.spring-street') })
        });

        container.select('.search-header input')
          .on('keyup.intro', checkSearchResult);
      });
  }


  // "Choose Spring Street from the list to select it..."
  // Click Spring Street item to advance
  function checkSearchResult() {
    if (!_doesSpringStreetExist()) return continueTo(searchStreet);

    const first = container.select('.feature-list-item:nth-child(0n+2)');  // skip "No Results" item
    const firstName = first.select('.entity-name');
    const name = t('intro.graph.name.spring-street');

    if (!firstName.empty() && firstName.html() === name) {
      curtain.reveal({
        revealNode: first.node(),
        revealPadding: 5,
        tipHtml: helpHtml('intro.navigation.choose_street', { name: name })
      });

      context.on('enter.intro', () => continueTo(selectedStreet));

      container.select('.search-header input')
        .on('keydown.intro', eventCancel, true)
        .on('keyup.intro', null);
    }

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      container.select('.search-header input')
        .on('keydown.intro', null)
        .on('keyup.intro', null);
      nextStep();
    }
  }


  // "Great! Spring Street is now selected..."
  // Click Ok to advance
  function selectedStreet() {
    if (!_isSpringStreetSelected()) return searchStreet();

    // Note, the map is about to try easing to show all of Spring Street
    // due to the user clicking it in the feature list.
    // For the purposes of the tutorial, we want to force the map
    // to show only the `springStreetExtent` instead.
    const loc = springStreetExtent.center();
    map
      .setCenterZoomAsync(loc, 19, 0 /* asap */)
      .then(() => {
        curtain.reveal({
          revealExtent: springStreetExtent,
          revealPadding: 40,
          tipHtml: helpHtml('intro.navigation.selected_street', { name: t('intro.graph.name.spring-street') }),
          buttonText: t.html('intro.ok'),
          buttonCallback: editorStreet
        });
      });
  }


  // "The fields shown for a street are different than the fields that were shown for the town hall."
  // Close Entity editor / leave select mode to advance
  function editorStreet() {
    if (!_isSpringStreetSelected()) return searchStreet();

    _showEntityEditor();

    const iconSelector = '.entity-editor-pane button.close svg use';
    const iconName = d3_select(iconSelector).attr('href') || '#iD-icon-close';
    const tipHtml = helpHtml('intro.navigation.street_different_fields') + '{br}' +
      helpHtml('intro.navigation.editor_street', {
        button: icon(iconName, 'inline'),
        field1: onewayField.label(),
        field2: maxspeedField.label()
      });

    curtain.reveal({
      revealSelector: '.entity-editor-pane',
      tipHtml: tipHtml
    });

    context.on('enter.intro', () => continueTo(play));

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // Free play
  // Click on Points (or another) chapter to advance
  function play() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.ideditor',
      tipSelector: '.intro-nav-wrap .chapter-point',
      tipHtml: helpHtml('intro.navigation.play', { next: t('intro.points.title') }),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
  }


  chapter.enter = () => {
    dragMap();
  };


  chapter.exit = () => {
    _timeouts.forEach(window.clearTimeout);
    if (_onMove) map.off('move', _onMove);
    context.on('enter.intro', null);
    history.on('change.intro', null);
    container.select('.inspector-wrap').on('wheel.intro', null);
    container.select('.search-header input').on('keydown.intro keyup.intro', null);
  };


  chapter.restart = () => {
    chapter.exit();
    chapter.enter();
  };


  return utilRebind(chapter, dispatch, 'on');
}
