import { Extent } from '@rapid-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { utilArrayUniq } from '@rapid-sdk/util';

import { actionChangePreset } from '../../actions/change_preset.js';
import { utilRebind } from '../../util/index.js';
import { delayAsync, eventCancel, helpHtml, isMostlySquare, transitionTime } from './helper.js';


export function uiIntroBuilding(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.buildings.title' };
  const container = context.container();
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const presets = context.systems.presets;
  const ui = context.systems.ui;
  const editMenu = ui.editMenu;

  const houseExtent = new Extent([-85.62836, 41.95622], [-85.62791, 41.95654]);
  const tankExtent = new Extent([-85.62766, 41.95324], [-85.62695, 41.95372]);
  const buildingCatetory = presets.item('category-building');
  const housePreset = presets.item('building/house');
  const tankPreset = presets.item('man_made/storage_tank');

  let _chapterCancelled = false;
  let _rejectStep = null;
  let _onMapMove = null;
  let _onModeChange = null;
  let _onStableChange = null;
  let _houseID = null;
  let _tankID = null;


  // Helper functions
  function _doesHouseExist() {
    const graph = editor.staging.graph;
    return _houseID && graph.hasEntity(_houseID);
  }

  function _isHouseSelected() {
    if (context.mode?.id !== 'select-osm') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === _houseID;
  }

  function _doesTankExist() {
    const graph = editor.staging.graph;
    return _tankID && graph.hasEntity(_tankID);
  }

  function _isTankSelected() {
    if (context.mode?.id !== 'select-osm') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === _tankID;
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


  // "You can help improve this database by tracing buildings that aren't already mapped."
  // Click Add Area to advance
  function addHouseAsync() {
    context.enter('browse');
    editor.restoreCheckpoint('initial');
    _houseID = null;

    const loc = houseExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setMapParamsAsync(loc, 19, 0, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        _onModeChange = () => resolve(startHouseAsync);

        const tooltip = curtain.reveal({
          revealSelector: 'button.draw-area',
          tipHtml: helpHtml(context, 'intro.buildings.add_building')
        });

        tooltip.selectAll('.popover-inner')
          .insert('svg', 'span')
          .attr('class', 'tooltip-illustration')
          .append('use')
          .attr('xlink:href', '#rapid-graphic-buildings');
      }))
      .finally(() => {
        _onModeChange = null;
      });
  }


  // "Let's add this house to the map by tracing its outline."
  // Place the first point to advance
  function startHouseAsync() {
    _houseID = null;

    return map
      .setMapParamsAsync(houseExtent.center(), 20, 0, 200)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (context.mode?.id !== 'draw-area') { resolve(addHouseAsync); return; }

        _onModeChange = reject;   // disallow mode change
        _onStableChange = (difference) => {
          for (const entity of difference.created()) {  // created a node and a way
            if (entity.type === 'way') {
              _houseID = entity.id;
              resolve(continueHouseAsync);
            }
          }
        };

        const textID = (context.lastPointerType === 'mouse') ? 'click' : 'tap';
        const startString = helpHtml(context, 'intro.buildings.start_building') +
          helpHtml(context, `intro.buildings.building_corner_${textID}`);

        curtain.reveal({
          revealExtent: houseExtent,
          tipHtml: startString
        });

      }))
      .finally(() => {
        _onModeChange = null;
        _onStableChange = null;
      });
  }


  // "Continue placing nodes to trace the outline of the building."
  // Enter Select mode to advance
  function continueHouseAsync() {
    if (!_doesHouseExist() || context.mode?.id !== 'draw-area') return Promise.resolve(addHouseAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = () => {
        if (_doesHouseExist() && _isHouseSelected()) {
          const graph = editor.staging.graph;
          const way = graph.entity(_houseID);
          const nodes = graph.childNodes(way);
          const points = utilArrayUniq(nodes).map(n => context.viewport.project(n.loc));

          if (isMostlySquare(points)) {
            resolve(chooseCategoryBuildingAsync);
          } else {
            resolve(retryHouseAsync);
          }

        } else {
          reject();  // disallow mode change
        }
      };

      const textID = (context.lastPointerType === 'mouse') ? 'click' : 'tap';
      const continueString = helpHtml(context, 'intro.buildings.continue_building') + '{br}' +
        helpHtml(context, `intro.areas.finish_area_${textID}`) + helpHtml(context, 'intro.buildings.finish_building');

      curtain.reveal({
        revealExtent: houseExtent,
        tipHtml: continueString
      });

    })
    .finally(() => {
      _onModeChange = null;
    });
  }


  // "It looks like you had some trouble placing the nodes at the building corners. Try again!"
  // This happens if the isMostlySquare check fails on the shape the user drew.
  // Click Ok to advance
  function retryHouseAsync() {
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealExtent: houseExtent,
        tipHtml: helpHtml(context, 'intro.buildings.retry_building'),
        buttonText: l10n.t('intro.ok'),
        buttonCallback: () => resolve(addHouseAsync)
      });
    });
  }


  // "Choose Building Features from the list."
  // Expand the Building Features category to advance
  function chooseCategoryBuildingAsync() {
    return delayAsync()  // after preset pane visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;

        if (!_doesHouseExist()) { resolve(addHouseAsync); return; }
        if (!_isHouseSelected()) context.enter('select-osm', { selection: { osm: [_houseID] }} );

        _onModeChange = reject;   // disallow mode change

        ui.sidebar.showPresetList();
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        const button = container.select('.preset-category_building .preset-list-button');
        if (button.empty()) { resolve(addHouseAsync); return; }

        curtain.reveal({
          revealNode: button.node(),
          revealPadding: 5,
          tipHtml: helpHtml(context, 'intro.buildings.choose_category_building', { category: buildingCatetory.name() })
        });

        button.on('click.intro', () => resolve(choosePresetHouse));
      }))
      .finally(() => {
        _onModeChange = null;
        container.select('.inspector-wrap').on('wheel.intro', null);
        container.select('.preset-list-button').on('click.intro', null);
      });
  }


  // "There are many different types of buildings, but this one is clearly a house."
  // Select the House preset to advance
  function choosePresetHouse() {
    return delayAsync()  // after preset pane visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;

        if (!_doesHouseExist()) { resolve(addHouseAsync); return; }
        if (!_isHouseSelected()) context.enter('select-osm', { selection: { osm: [_houseID] }} );

        _onModeChange = reject;   // disallow mode change
        _onStableChange = (difference) => {
          const modified = difference.modified();
          if (modified.length === 1) {
            const graph = editor.staging.graph;
            if (presets.match(modified[0], graph) === housePreset) {
              resolve(hasHouseAsync);
            } else {
              resolve(chooseCategoryBuildingAsync);  // didn't pick house, retry
            }
          }
        };

        // ui.sidebar.showPresetList();  // calling this again causes issue
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        const button = container.select('.preset-building_house .preset-list-button');
        if (button.empty()) { resolve(addHouseAsync); return; }

        curtain.reveal({
          revealNode: button.node(),
          revealPadding: 5,
          tipHtml: helpHtml(context, 'intro.buildings.choose_preset_house', { preset: housePreset.name() })
        });

      }))
      .finally(() => {
        _onModeChange = null;
        _onStableChange = null;
        container.select('.inspector-wrap').on('wheel.intro', null);
        container.select('.preset-list-button').on('click.intro', null);
      });
  }


  // Set a history checkpoint here, so we can return back to it if needed
  function hasHouseAsync() {
    if (!_doesHouseExist()) return Promise.resolve(addHouseAsync);

    // Make sure it's still a house, in case user somehow changed it..
    const graph = editor.staging.graph;
    const entity = graph.entity(_houseID);
    const preset = presets.match(entity, graph);
    if (preset !== housePreset) {
      editor.perform(actionChangePreset(_houseID, preset, housePreset));
      editor.commit({
        annotation: l10n.t('operations.change_tags.annotation'),
        selectedIDs: [_houseID]
      });
    }

    editor.setCheckpoint('hasHouse');
    return Promise.resolve(rightClickHouseAsync);  // advance
  }


  // "Right-click to select the building you created and show the edit menu."
  // Open the edit menu to advance
  function rightClickHouseAsync() {
    if (!['browse', 'select-osm'].includes(context.mode?.id)) context.enter('browse');
    editor.restoreCheckpoint('hasHouse');

    // make sure user is zoomed in enough to actually see orthagonalize do something
    const setZoom = Math.max(map.zoom(), 20);

    return map
      .setMapParamsAsync(houseExtent.center(), setZoom, 0, 100)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        _onStableChange = reject;  // disallow doing anything else

        const textID = (context.lastPointerType === 'mouse') ? 'rightclick_building' : 'edit_menu_building_touch';
        curtain.reveal({
          revealExtent: houseExtent,
          tipHtml: helpHtml(context, `intro.buildings.${textID}`)
        });

        editMenu.on('toggled.intro', open => {
          if (open) resolve(clickSquareAsync);
        });
      }))
      .finally(() => {
        _onStableChange = null;
        editMenu.on('toggled.intro', null);
      });
  }


  // "The house that you just added will look even better with perfectly square corners."
  // "Press the Square button to tidy up the building's shape."
  // Square the building to advance
  function clickSquareAsync() {
    const buttonNode = container.select('.edit-menu-item-orthogonalize').node();
    if (!buttonNode) return Promise.resolve(rightClickHouseAsync);   // no Square button, try again

    return delayAsync()  // after edit menu fully visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesHouseExist() || !_isHouseSelected()) { resolve(rightClickHouseAsync); return; }

        const revealEditMenu = (duration = 0) => {
          const menuNode = container.select('.edit-menu').node();
          if (menuNode) {
            curtain.reveal({
              duration: duration,
              revealNode: menuNode,
              revealPadding: 50,
              tipHtml: helpHtml(context, 'intro.buildings.square_building')
            });
          } else {
            reject();   // menu has gone away - user scrolled it offscreen?
          }
        };

        _onModeChange = reject;   // disallow mode change
        _onStableChange = () => {
          _onStableChange = null;
          _onMapMove = null;
          curtain.reveal({ revealExtent: houseExtent });  // watch it change
          resolve();
        };
        _onMapMove = revealEditMenu;     // on map moves, have the curtain follow the menu immediately

        revealEditMenu(250);             // first time revealing menu, transition curtain to the menu

      }))
      .then(delayAsync)   // wait for orthogonalize transtion to complete
      .then(() => {       // then check undo annotation to see what the user did
        if (editor.getUndoAnnotation() === l10n.t('operations.orthogonalize.annotation.feature', { n: 1 })) {
          return doneSquareAsync;
        } else {
          return retryClickSquareAsync;
        }
      })
      .finally(() => {
        _onMapMove = null;
        _onModeChange = null;
        _onStableChange = null;
      });
  }


  // "You didn't press the Square button. Try again."
  // Click Ok to advance
  function retryClickSquareAsync() {
    context.enter('browse');

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealExtent: houseExtent,
        tipHtml: helpHtml(context, 'intro.buildings.retry_square'),
        buttonText: l10n.t('intro.ok'),
        buttonCallback: () => resolve(rightClickHouseAsync)
      });
    });
  }


  // "See how the corners of the building moved into place? Let's learn another useful trick."
  // Click Ok to advance
  function doneSquareAsync() {
    editor.setCheckpoint('doneSquare');

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealExtent: houseExtent,
        tipHtml: helpHtml(context, 'intro.buildings.done_square'),
        buttonText: l10n.t('intro.ok'),
        buttonCallback: () => resolve(addTankAsync)
      });
    });
  }


  // "Next we'll trace this circular storage tank..."
  // Click Add Area to advance
  function addTankAsync() {
    context.enter('browse');
    editor.restoreCheckpoint('doneSquare');
    _tankID = null;

    const loc = tankExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setMapParamsAsync(loc, 19.5, 0, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        _onModeChange = () => resolve(startTankAsync);

        curtain.reveal({
          revealSelector: 'button.draw-area',
          tipHtml: helpHtml(context, 'intro.buildings.add_tank')
        });
      }))
      .finally(() => {
        _onModeChange = null;
      });
  }


  // "Don't worry, you won't need to draw a perfect circle. Just draw an area inside the tank that touches its edge."
  // Place the first point to advance
  function startTankAsync() {
    if (context.mode?.id !== 'draw-area') return Promise.resolve(addTankAsync);
    _tankID = null;

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = reject;   // disallow mode change
      _onStableChange = (difference) => {
        for (const entity of difference.created()) {  // created a node and a way
          if (entity.type === 'way') {
            _tankID = entity.id;
            resolve(continueTankAsync);
          }
        }
      };

      const textID = context.lastPointerType === 'mouse' ? 'click' : 'tap';
      const startString = helpHtml(context, 'intro.buildings.start_tank') +
        helpHtml(context, `intro.buildings.tank_edge_${textID}`);

      curtain.reveal({
        revealExtent: tankExtent,
        tipHtml: startString
      });
    })
    .finally(() => {
      _onModeChange = null;
      _onStableChange = null;
    });
  }


  // "Add a few more nodes around the edge. The circle will be created outside the nodes that you draw."
  // Enter Select mode to advance
  function continueTankAsync() {
    if (context.mode?.id !== 'draw-area') return Promise.resolve(addTankAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = () => {
        if (_doesTankExist() && _isTankSelected()) {
          resolve(searchPresetTankAsync);
        } else {
          reject();
        }
      };

      const textID = context.lastPointerType === 'mouse' ? 'click' : 'tap';
      const continueString = helpHtml(context, 'intro.buildings.continue_tank') + '{br}' +
        helpHtml(context, `intro.areas.finish_area_${textID}`) + helpHtml(context, 'intro.buildings.finish_tank');

      curtain.reveal({
        revealExtent: tankExtent,
        tipHtml: continueString
      });
    })
    .finally(() => {
      _onModeChange = null;
    });
  }


  // "Search for Storage Tank."
  // "Choose Storage Tank from the list"
  // Choose the Storage Tank preset to advance
  function searchPresetTankAsync() {
    return delayAsync()  // after preset pane visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesTankExist()) { resolve(addTankAsync); return; }
        if (!_isTankSelected()) context.enter('select-osm', { selection: { osm: [_tankID] }} );

        _onModeChange = reject;   // disallow mode change
        _onStableChange = (difference) => {
          const modified = difference.modified();
          if (modified.length === 1) {
            const graph = editor.staging.graph;
            if (presets.match(modified[0], graph) === tankPreset) {
              resolve(hasTankAsync);
            } else {
              reject();  // didn't pick tank
            }
          }
        };

        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        ui.sidebar.showPresetList();

        curtain.reveal({
          revealSelector: '.preset-search-input',
          tipHtml: helpHtml(context, 'intro.buildings.search_tank', { preset: tankPreset.name() })
        });

        container.select('.preset-search-input')
          .on('keydown.intro', null)
          .on('keyup.intro', _checkPresetSearch);


        // Get user to choose the Tank preset from the search result
        function _checkPresetSearch() {
          const first = container.select('.preset-list-item:first-child');
          if (!first.classed('preset-man_made_storage_tank')) return;

          curtain.reveal({
            revealNode: first.select('.preset-list-button').node(),
            revealPadding: 5,
            tipHtml: helpHtml(context, 'intro.buildings.choose_tank', { preset: tankPreset.name() })
          });

          container.select('.preset-search-input')
            .on('keydown.intro', eventCancel, true)   // no more typing
            .on('keyup.intro', null);
        }
      }))
      .finally(() => {
        _onModeChange = null;
        _onStableChange = null;
        container.select('.inspector-wrap').on('wheel.intro', null);
        container.select('.preset-search-input').on('keydown.intro keyup.intro', null);
      });
  }


  // Set a history checkpoint here, so we can return back to it if needed
  function hasTankAsync() {
    if (!_doesTankExist()) return Promise.resolve(addTankAsync);

    // Make sure it's still a tank, in case user somehow changed it..
    const graph = editor.staging.graph;
    const entity = graph.entity(_tankID);
    const preset = presets.match(entity, graph);
    if (preset !== tankPreset) {
      editor.perform(actionChangePreset(_tankID, preset, tankPreset));
      editor.commit({
        annotation: l10n.t('operations.change_tags.annotation'),
        selectedIDs: [_tankID]
      });
    }

    editor.setCheckpoint('hasTank');
    return Promise.resolve(rightClickTankAsync);  // advance
  }


  // "Right-click to select the storage tank you created and show the edit menu."
  // Open the edit menu to advance
  function rightClickTankAsync() {
    if (!['browse', 'select-osm'].includes(context.mode?.id)) context.enter('browse');
    editor.restoreCheckpoint('hasTank');

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onStableChange = reject;  // disallow doing anything else

      const textID = (context.lastPointerType === 'mouse') ? 'rightclick_tank' : 'edit_menu_tank_touch';
      curtain.reveal({
        revealExtent: tankExtent,
        tipHtml: helpHtml(context, `intro.buildings.${textID}`)
      });

      editMenu.on('toggled.intro', open => {
        if (open) resolve(clickCircleAsync);
      });
    })
    .finally(() => {
      _onStableChange = null;
      editMenu.on('toggled.intro', null);
    });
  }


  // "Press the Circularize button to make the tank a circle."
  // Circularize the tank to advance
  function clickCircleAsync() {
    const buttonNode = container.select('.edit-menu-item-circularize').node();
    if (!buttonNode) return Promise.resolve(rightClickTankAsync);   // no Circularize button, try again

    return delayAsync()  // after edit menu fully visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesTankExist() || !_isTankSelected()) { resolve(rightClickTankAsync); return; }

        _onModeChange = reject;   // disallow mode change

        const revealEditMenu = (duration = 0) => {
          const menuNode = container.select('.edit-menu').node();
          if (menuNode) {
            curtain.reveal({
              duration: duration,
              revealNode: menuNode,
              revealPadding: 50,
              tipHtml: helpHtml(context, 'intro.buildings.circle_tank')
            });
          } else {
            reject();   // menu has gone away - user scrolled it offscreen?
          }
        };

        _onStableChange = () => {
          _onMapMove = null;
          _onStableChange = null;
          curtain.reveal({ revealExtent: tankExtent });  // watch it change
          resolve();
        };

        _onMapMove = revealEditMenu;     // on map moves, have the curtain follow the menu immediately
        revealEditMenu(250);             // first time revealing menu, transition curtain to the menu

      }))
      .then(delayAsync)   // wait for circularize transtion to complete
      .then(() => {       // then check undo annotation to see what the user did
        if (editor.getUndoAnnotation() === l10n.t('operations.circularize.annotation.feature', { n: 1 })) {
          return playAsync;
        } else {
          return retryClickCircleAsync;
        }
      })
      .finally(() => {
        _onMapMove = null;
        _onModeChange = null;
        _onStableChange = null;
      });
  }


  // "You didn't press the {circularize_icon} {circularize} button. Try again."
  // Click Ok to advance
  function retryClickCircleAsync() {
    context.enter('browse');

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealExtent: tankExtent,
        tipHtml: helpHtml(context, 'intro.buildings.retry_circle'),
        buttonText: l10n.t('intro.ok'),
        buttonCallback: () => resolve(rightClickTankAsync)
      });
    });
  }


  // Free play
  // Click on Rapid Features (or another) chapter to advance
  function playAsync() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.ideditor',
      tipSelector: '.intro-nav-wrap .chapter-rapid',
      tipHtml: helpHtml(context, 'intro.buildings.play', { next: l10n.t('intro.rapid.title') }),
      buttonText: l10n.t('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
    return Promise.resolve();
  }


  chapter.enter = () => {
    _chapterCancelled = false;
    _rejectStep = null;
    _onMapMove = null;
    _onModeChange = null;
    _onStableChange = null;

    context.on('modechange', _modeChangeListener);
    map.on('move', _mapMoveListener);
    editor.on('stablechange', _stableChangeListener);

    runAsync(addHouseAsync)
      .catch(e => { if (e instanceof Error) console.error(e); })   // eslint-disable-line no-console
      .finally(() => {
        context.off('modechange', _modeChangeListener);
        map.off('move', _mapMoveListener);
        editor.off('stablechange', _stableChangeListener);
      });

    function _mapMoveListener(...args) {
      if (typeof _onMapMove === 'function') _onMapMove(...args);
    }
    function _modeChangeListener(...args) {
      if (typeof _onModeChange === 'function') _onModeChange(...args);
    }
    function _stableChangeListener(...args) {
      if (typeof _onStableChange === 'function') _onStableChange(...args);
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
