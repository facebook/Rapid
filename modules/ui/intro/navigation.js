import { Extent, vecEqual } from '@rapid-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { utilRebind } from '../../util/rebind';
import { delayAsync, eventCancel, helpHtml, icon, showEntityEditor, transitionTime } from './helper';


export function uiIntroNavigation(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.navigation.title' };
  const container = context.container();
  const editSystem = context.systems.edits;
  const mapSystem = context.systems.map;
  const presetSystem = context.systems.presets;

  const townHallID = 'n2061';
  const townHallExtent = new Extent([-85.63654, 41.94290], [-85.63632, 41.94307]);
  const springStreetID = 'w397';
  const springStreetExtent = new Extent([-85.63588, 41.94155], [-85.63574, 41.94278]);
  const onewayField = presetSystem.field('oneway');
  const maxspeedField = presetSystem.field('maxspeed');

  let _chapterCancelled = false;
  let _rejectStep = null;
  let _onMapMove = null;
  let _onModeChange = null;


  // Helper functions
  function _isTownHallSelected() {
    if (!context.hasEntity(townHallID)) return false;
    if (context.mode?.id !== 'select-osm') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === townHallID;
  }

  function _doesSpringStreetExist() {
    return context.hasEntity(springStreetID);
  }

  function _isSpringStreetSelected() {
    if (!context.hasEntity(springStreetID)) return false;
    if (context.mode?.id !== 'select-osm') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === springStreetID;
  }


  // How it works
  // - Each step returns a Promise
  // - Each Promise is responsible for its own setup and cleanup
  // - Each Promise should resolve to what the next step is to run
  //     Normal flow is resolve to the next step
  //     If precondition not satisfied (feature missing or something weird), resolve to an earlier step
  // - The `runAsync` function will:
  //     Run each Promise recursively until there is no next step
  //     On rejection/catch, resolve to the current step, and retry it
  //     Reject if the chapter is being cancelled (i.e. ignore whatever the next step is supposed to be)
  // - We keep track of the reject handlers for each Promise in _rejectStep
  //     so that the entire chapter can be cancelled at any time by calling .exit()
  // - Always .catch, but be aware:
  //     Without catch, Chrome debugger will stop on an uncaught rejected promise
  //     Catch with an empty block will swallow actual errors and make debugging difficult
  //     Log error if it's actually an instanceof Error
  //     Ignore error if it's just a normal reject being used to control the flow
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


  // "The main map area shows OpenStreetMap data on top of a background."
  // Drag the map to advance
  function dragMapAsync() {
    context.enter('browse');
    editSystem.resetToCheckpoint('initial');

    const loc = townHallExtent.center();
    const msec = transitionTime(loc, mapSystem.center());
    if (msec > 0) curtain.hide();

    return mapSystem
      .setCenterZoomAsync(loc, 19, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        const centerStart = mapSystem.center();
        const textID = context.lastPointerType === 'mouse' ? 'drag' : 'drag_touch';
        const dragString = helpHtml(context, 'intro.navigation.map_info') + '{br}' + helpHtml(context, `intro.navigation.${textID}`);

        _onMapMove = () => {
          if (!vecEqual(centerStart, mapSystem.center())) {  // map moved
            resolve(zoomMapAsync);
          }
        };

        curtain.reveal({
          revealSelector: '.main-map',
          tipHtml: dragString
        });
      }))
      .finally(() => {
        _onMapMove = null;
      })
      .then(nextStep => delayAsync(2000).then(nextStep));
  }


  // Zoom the map to advance
  function zoomMapAsync() {
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      const zoomStart = mapSystem.zoom();
      const textID = context.lastPointerType === 'mouse' ? 'zoom' : 'zoom_touch';
      const zoomString = helpHtml(context, `intro.navigation.${textID}`);

      _onMapMove = () => {
        if (zoomStart !== mapSystem.zoom()) {  // map zoomed
          resolve(featuresAsync);
        }
      };

      curtain.reveal({
        revealSelector: '.main-map',
        tipHtml: zoomString
      });
    })
    .finally(() => {
      _onMapMove = null;
    })
    .then(nextStep => delayAsync(2000).then(nextStep));
  }


  // "We use the word *features* to describe the things that appear on the map..."
  // Click Ok to advance
  function featuresAsync() {
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealSelector: '.main-map',
        tipHtml: helpHtml(context, 'intro.navigation.features'),
        buttonText: context.tHtml('intro.ok'),
        buttonCallback: () => resolve(pointsLinesAreasAsync)
      });
    });
  }


  // "Map features are represented using points, lines, or areas..."
  // Click Ok to advance
  function pointsLinesAreasAsync() {
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealSelector: '.main-map',
        tipHtml: helpHtml(context, 'intro.navigation.points_lines_areas'),
        buttonText: context.tHtml('intro.ok'),
        buttonCallback: () => resolve(nodesWaysAsync)
      });
    });
  }


  // "Points are sometimes called nodes and lines and areas are sometimes called ways..."
  // Click Ok to advance
  function nodesWaysAsync() {
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealSelector: '.main-map',
        tipHtml: helpHtml(context, 'intro.navigation.nodes_ways'),
        buttonText: context.tHtml('intro.ok'),
        buttonCallback: () => resolve(clickTownHallAsync)
      });
    });
  }


  // Select the town hall to advance
  function clickTownHallAsync() {
    context.enter('browse');
    editSystem.resetToCheckpoint('initial');

    const loc = townHallExtent.center();
    const msec = transitionTime(loc, mapSystem.center());
    if (msec > 0) curtain.hide();

    return mapSystem
      .setCenterZoomAsync(loc, 19, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;

        _onModeChange = () => resolve(selectedTownHallAsync);

        const textID = context.lastPointerType === 'mouse' ? 'click_townhall' : 'tap_townhall';
        curtain.reveal({
          revealExtent: townHallExtent,
          tipHtml: helpHtml(context, `intro.navigation.${textID}`)
        });

      }))
      .finally(() => {
        _onModeChange = null;
      });
  }


  // "Great! The point is now selected..."
  // Click Ok to advance
  function selectedTownHallAsync() {
    if (!_isTownHallSelected()) return Promise.resolve(clickTownHallAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = reject;   // disallow mode change

      curtain.reveal({
        revealExtent: townHallExtent,
        tipHtml: helpHtml(context, 'intro.navigation.selected_townhall'),
        buttonText: context.tHtml('intro.ok'),
        buttonCallback: () => resolve(editorTownHallAsync)
      });
    })
    .finally(() => {
      _onModeChange = null;
    });
  }


  // "When a feature is selected, the feature editor is displayed alongside the map."
  // Click Ok to advance
  function editorTownHallAsync() {
    if (!_isTownHallSelected()) return Promise.resolve(clickTownHallAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = reject;   // disallow mode change

      showEntityEditor(container);
      container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml(context, 'intro.navigation.editor_townhall'),
        buttonText: context.tHtml('intro.ok'),
        buttonCallback: () => resolve(presetTownHallAsync)
      });
    })
    .finally(() => {
      _onModeChange = null;
      container.select('.inspector-wrap').on('wheel.intro', null);
    });
  }


  // "The top part of the feature editor shows the feature's type."
  // Click Ok to advance
  function presetTownHallAsync() {
    if (!_isTownHallSelected()) return Promise.resolve(clickTownHallAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = reject;   // disallow mode change

      showEntityEditor(container);
      container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

      // preset match, in case the user happened to change it.
      const entity = context.entity(context.selectedIDs()[0]);
      const preset = presetSystem.match(entity, context.graph());

      curtain.reveal({
        revealSelector: '.entity-editor-pane .section-feature-type',
        revealPadding: 5,
        tipHtml: helpHtml(context, 'intro.navigation.preset_townhall', { preset: preset.name() }),
        buttonText: context.tHtml('intro.ok'),
        buttonCallback: () => resolve(fieldsTownHallAsync)
      });
    })
    .finally(() => {
      _onModeChange = null;
      container.select('.inspector-wrap').on('wheel.intro', null);
    });
  }


  // "The middle part of the feature editor contains fields..."
  // Click Ok to advance
  function fieldsTownHallAsync() {
    if (!_isTownHallSelected()) return Promise.resolve(clickTownHallAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = reject;   // disallow mode change

      showEntityEditor(container);
      container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

      curtain.reveal({
        revealSelector: '.entity-editor-pane .section-preset-fields',
        revealPadding: 5,
        tipHtml: helpHtml(context, 'intro.navigation.fields_townhall'),
        buttonText: context.tHtml('intro.ok'),
        buttonCallback: () => resolve(closeTownHallAsync)
      });
    })
    .finally(() => {
      _onModeChange = null;
      container.select('.inspector-wrap').on('wheel.intro', null);
    });
  }


  // Close entity editor / leave select mode to advance
  function closeTownHallAsync() {
    if (!_isTownHallSelected()) return Promise.resolve(clickTownHallAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = () => resolve(searchStreetAsync);

      showEntityEditor(container);

      const iconSelector = '.entity-editor-pane button.close svg use';
      const iconName = d3_select(iconSelector).attr('href') || '#rapid-icon-close';
      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipSelector: '.entity-editor-pane button.close',
        tipHtml: helpHtml(context, 'intro.navigation.close_townhall', { button: icon(iconName, 'inline') })
      });
    })
    .finally(() => {
      _onModeChange = null;
    });
  }


  // "You can also search for features in the current view, or worldwide."
  // "Search for Spring Street..."
  // Type in the search box to advance
  function searchStreetAsync() {
    context.enter('browse');
    editSystem.resetToCheckpoint('initial');  // ensure spring street exists

    const loc = springStreetExtent.center();
    const msec = transitionTime(loc, mapSystem.center());
    if (msec > 0) curtain.hide();

    return mapSystem
      .setCenterZoomAsync(loc, 19, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        curtain.reveal({
          revealSelector: '.search-header input',
          tipHtml: helpHtml(context, 'intro.navigation.search_street', { name: context.t('intro.graph.name.spring-street') })
        });

        container.select('.search-header input').on('keyup.intro', () => resolve(checkSearchResultAsync));
      }))
      .finally(() => {
        container.select('.search-header input').on('keyup.intro', null);
      });
  }


  // "Choose Spring Street from the list to select it..."
  // Click Spring Street item to advance
  function checkSearchResultAsync() {
    if (!_doesSpringStreetExist()) return Promise.resolve(searchStreetAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = () => resolve(selectedStreetAsync);

      container.select('.search-header input').on('keyup.intro', () => {
        const first = container.select('.feature-list-item:nth-child(0n+2)');  // skip "No Results" item
        const firstName = first.select('.entity-name');
        const name = context.t('intro.graph.name.spring-street');

        if (!firstName.empty() && firstName.html() === name) {
          curtain.reveal({
            revealNode: first.node(),
            revealPadding: 5,
            tipHtml: helpHtml(context, 'intro.navigation.choose_street', { name: name })
          });
          // no more typing
          container.select('.search-header input')
            .on('keydown.intro', eventCancel, true)
            .on('keyup.intro', null);
        }
      });
    })
    .finally(() => {
      _onModeChange = null;
      container.select('.search-header input')
        .on('keydown.intro', null)
        .on('keyup.intro', null);
    });
  }


  // "Great! Spring Street is now selected..."
  // Click Ok to advance
  function selectedStreetAsync() {
    // Note, the map is about to try easing to show all of Spring Street
    // due to the user clicking it in the feature list.
    // For the purposes of the tutorial, we want to force the map
    // to show only the `springStreetExtent` instead.
    const loc = springStreetExtent.center();

    return mapSystem
      .setCenterZoomAsync(loc, 19, 0 /* asap */)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        _onModeChange = reject;   // disallow mode change

        if (!_isSpringStreetSelected()) { resolve(searchStreetAsync); return; }

        curtain.reveal({
          revealExtent: springStreetExtent,
          revealPadding: 40,
          tipHtml: helpHtml(context, 'intro.navigation.selected_street', { name: context.t('intro.graph.name.spring-street') }),
          buttonText: context.tHtml('intro.ok'),
          buttonCallback: () => resolve(editorStreetAsync)
        });
      }))
      .finally(() => {
        _onModeChange = null;
      });
  }


  // "The fields shown for a street are different than the fields that were shown for the town hall."
  // Close Entity editor / leave select mode to advance
  function editorStreetAsync() {
    if (!_isSpringStreetSelected()) return Promise.resolve(searchStreetAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = () => resolve(playAsync);

      showEntityEditor(container);
      const iconSelector = '.entity-editor-pane button.close svg use';
      const iconName = d3_select(iconSelector).attr('href') || '#rapid-icon-close';
      const tipHtml = helpHtml(context, 'intro.navigation.street_different_fields') + '{br}' +
        helpHtml(context, 'intro.navigation.editor_street', {
          button: icon(iconName, 'inline'),
          field1: onewayField.label(),
          field2: maxspeedField.label()
        });

      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: tipHtml
      });
    })
    .finally(() => {
      _onModeChange = null;
    });
  }


  // Free play
  // Click on Points (or another) chapter to advance
  function playAsync() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.ideditor',
      tipSelector: '.intro-nav-wrap .chapter-point',
      tipHtml: helpHtml(context, 'intro.navigation.play', { next: context.t('intro.points.title') }),
      buttonText: context.tHtml('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
    return Promise.resolve();
  }


  chapter.enter = () => {
    _chapterCancelled = false;
    _rejectStep = null;
    _onMapMove = null;
    _onModeChange = null;

    context.on('modechange', _modeChangeListener);
    mapSystem.on('move', _mapMoveListener);

    runAsync(dragMapAsync)
      .catch(e => { if (e instanceof Error) console.error(e); })   // eslint-disable-line no-console
      .finally(() => {
        context.off('modechange', _modeChangeListener);
        mapSystem.off('move', _mapMoveListener);
      });

    function _mapMoveListener() {
      if (typeof _onMapMove === 'function') _onMapMove();
    }
    function _modeChangeListener(mode) {
      if (typeof _onModeChange === 'function') _onModeChange(mode);
    }
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
