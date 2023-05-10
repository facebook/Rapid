import { Extent } from '@rapid-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { utilArrayUniq } from '@rapid-sdk/util';

import { t } from '../../core/localizer';
import { actionChangePreset } from '../../actions/change_preset';
import { modeSelect } from '../../modes/select';
import { utilRebind } from '../../util';
import { delayAsync, eventCancel, helpHtml, isMostlySquare, showPresetList, transitionTime } from './helper';


export function uiIntroBuilding(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.buildings.title' };
  const editMenu = context.ui().editMenu();
  const container = context.container();
  const history = context.history();
  const map = context.map();
  const presetSystem = context.presetSystem();

  const houseExtent = new Extent([-85.62836, 41.95622], [-85.62791, 41.95654]);
  const tankExtent = new Extent([-85.62766, 41.95324], [-85.62695, 41.95372]);
  const buildingCatetory = presetSystem.item('category-building');
  const housePreset = presetSystem.item('building/house');
  const tankPreset = presetSystem.item('man_made/storage_tank');

  let _chapterCancelled = false;
  let _rejectStep = null;
  let _houseID = null;
  let _tankID = null;


  // Helper functions
  function _doesHouseExist() {
    return _houseID && context.hasEntity(_houseID);
  }

  function _isHouseSelected() {
    if (context.mode().id !== 'select') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === _houseID;
  }

  function _doesTankExist() {
    return _tankID && context.hasEntity(_tankID);
  }

  function _isTankSelected() {
    if (context.mode().id !== 'select') return false;
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
    history.reset('initial');
    _houseID = null;

    const loc = houseExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setCenterZoomAsync(loc, 19, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        const tooltip = curtain.reveal({
          revealSelector: 'button.draw-area',
          tipHtml: helpHtml('intro.buildings.add_building')
        });

        tooltip.selectAll('.popover-inner')
          .insert('svg', 'span')
          .attr('class', 'tooltip-illustration')
          .append('use')
          .attr('xlink:href', '#rapid-graphic-buildings');

        context.on('enter.intro', () => resolve(startHouseAsync));
      }))
      .finally(() => {
        context.on('enter.intro', null);
      });
  }


  // "Let's add this house to the map by tracing its outline."
  // Place the first point to advance
  function startHouseAsync() {
    _houseID = null;

    return map
      .setCenterZoomAsync(houseExtent.center(), 20, 200)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (context.mode().id !== 'draw-area') { resolve(addHouseAsync); return; }

        const textID = (context.lastPointerType() === 'mouse') ? 'click' : 'tap';
        const startString = helpHtml('intro.buildings.start_building') +
          helpHtml(`intro.buildings.building_corner_${textID}`);

        curtain.reveal({
          revealExtent: houseExtent,
          tipHtml: startString
        });

        history.on('change.intro', difference => {
          if (!difference) return;
          for (const entity of difference.created()) {  // created a node and a way
            if (entity.type === 'way') {
              _houseID = entity.id;
              resolve(continueHouseAsync);
            }
          }
        });

        context.on('enter.intro', reject);   // disallow mode change
      }))
      .finally(() => {
        history.on('change.intro', null);
        context.on('enter.intro', null);
      });
  }


  // "Continue placing nodes to trace the outline of the building."
  // Enter Select mode to advance
  function continueHouseAsync() {
    if (!_doesHouseExist() || context.mode().id !== 'draw-area') return Promise.resolve(addHouseAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      const textID = (context.lastPointerType() === 'mouse') ? 'click' : 'tap';
      const continueString = helpHtml('intro.buildings.continue_building') + '{br}' +
        helpHtml(`intro.areas.finish_area_${textID}`) + helpHtml('intro.buildings.finish_building');

      curtain.reveal({
        revealExtent: houseExtent,
        tipHtml: continueString
      });

      context.on('enter.intro', () => {
        if (_doesHouseExist() && _isHouseSelected()) {
          const graph = context.graph();
          const way = context.entity(_houseID);
          const nodes = graph.childNodes(way);
          const points = utilArrayUniq(nodes).map(n => context.projection.project(n.loc));

          if (isMostlySquare(points)) {
            resolve(chooseCategoryBuildingAsync);
          } else {
            resolve(retryHouseAsync);
          }

        } else {
          reject();  // disallow mode change
        }
      });
    })
    .finally(() => {
      context.on('enter.intro', null);
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
        tipHtml: helpHtml('intro.buildings.retry_building'),
        buttonText: t.html('intro.ok'),
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
        if (!_isHouseSelected()) context.enter(modeSelect(context, [_houseID]));

        showPresetList(container);
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        const button = container.select('.preset-category-building .preset-list-button');
        curtain.reveal({
          revealNode: button.node(),
          revealPadding: 5,
          tipHtml: helpHtml('intro.buildings.choose_category_building', { category: buildingCatetory.name() })
        });

        button.on('click.intro', () => resolve(choosePresetHouse));

        context.on('enter.intro', reject);   // disallow mode change
      }))
      .finally(() => {
        container.select('.inspector-wrap').on('wheel.intro', null);
        container.select('.preset-list-button').on('click.intro', null);
        context.on('enter.intro', null);
      });
  }


  // "There are many different types of buildings, but this one is clearly a house."
  // Select the House preset to advance
  function choosePresetHouse() {
    return delayAsync()  // after preset pane visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesHouseExist()) { resolve(addHouseAsync); return; }
        if (!_isHouseSelected()) context.enter(modeSelect(context, [_houseID]));

        showPresetList(container);
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        const button = container.select('.preset-building-house .preset-list-button');
        curtain.reveal({
          revealNode: button.node(),
          revealPadding: 5,
          tipHtml: helpHtml('intro.buildings.choose_preset_house', { preset: housePreset.name() })
        });

        history.on('change.intro', difference => {
          if (!difference) return;
          const modified = difference.modified();
          if (modified.length === 1) {
            if (presetSystem.match(modified[0], context.graph()) === housePreset) {
              resolve(hasHouseAsync);
            } else {
              resolve(chooseCategoryBuildingAsync);  // didn't pick house, retry
            }
          }
        });

        context.on('enter.intro', reject);   // disallow mode change
      }))
      .finally(() => {
        container.select('.inspector-wrap').on('wheel.intro', null);
        container.select('.preset-list-button').on('click.intro', null);
        history.on('change.intro', null);
        context.on('enter.intro', null);
      });
  }


  // Set a history checkpoint here, so we can return back to it if needed
  function hasHouseAsync() {
    if (!_doesHouseExist()) return Promise.resolve(addHouseAsync);

    // Make sure it's still a house, in case user somehow changed it..
    const entity = context.entity(_houseID);
    const oldPreset = presetSystem.match(entity, context.graph());
    context.replace(actionChangePreset(_houseID, oldPreset, housePreset));

    history.checkpoint('hasHouse');
    return Promise.resolve(rightClickHouseAsync);  // advance
  }


  // "Right-click to select the building you created and show the edit menu."
  // Open the edit menu to advance
  function rightClickHouseAsync() {
    if (!['browse', 'select'].includes(context.mode().id)) context.enter('browse');
    history.reset('hasHouse');

    // make sure user is zoomed in enough to actually see orthagonalize do something
    const setZoom = Math.max(map.zoom(), 20);

    return map
      .setCenterZoomAsync(houseExtent.center(), setZoom, 100)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;

        const textID = (context.lastPointerType() === 'mouse') ? 'rightclick_building' : 'edit_menu_building_touch';
        curtain.reveal({
          revealExtent: houseExtent,
          tipHtml: helpHtml(`intro.buildings.${textID}`)
        });

        editMenu.on('toggled.intro', open => {
          if (open) resolve(clickSquareAsync);
        });

        history.on('change.intro', reject);  // disallow doing anything else
      }))
      .finally(() => {
        editMenu.on('toggled.intro', null);
        history.on('change.intro', null);
      });
  }


  // "The house that you just added will look even better with perfectly square corners."
  // "Press the Square button to tidy up the building's shape."
  // Square the building to advance
  function clickSquareAsync() {
    const buttonNode = container.select('.edit-menu-item-orthogonalize').node();
    if (!buttonNode) return Promise.resolve(rightClickHouseAsync);   // no Square button, try again

    let revealEditMenu;

    return delayAsync()  // after edit menu fully visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesHouseExist() || !_isHouseSelected()) { resolve(rightClickHouseAsync); return; }

        revealEditMenu = (duration = 0) => {
          const menuNode = container.select('.edit-menu').node();
          if (menuNode) {
            curtain.reveal({
              duration: duration,
              revealNode: menuNode,
              revealPadding: 50,
              tipHtml: helpHtml('intro.buildings.square_building')
            });
          } else {
            reject();   // menu has gone away - user scrolled it offscreen?
          }
        };

        revealEditMenu(250);             // first time revealing menu, transition curtain to the menu
        map.on('move', revealEditMenu);  // on map moves, have the curtain follow the menu immediately

        history.on('change.intro', () => {
          map.off('move', revealEditMenu);
          history.on('change.intro', null);
          curtain.reveal({ revealExtent: houseExtent });  // watch it change
          resolve();
        });

        context.on('enter.intro', reject);   // disallow mode change
      }))
      .then(delayAsync)   // wait for orthogonalize transtion to complete
      .then(() => {       // then check undo annotation to see what the user did
        if (history.undoAnnotation() === t('operations.orthogonalize.annotation.feature', { n: 1 })) {
          return doneSquareAsync;
        } else {
          return retryClickSquareAsync;
        }
      })
      .finally(() => {
        history.on('change.intro', null);
        context.on('enter.intro', null);
        if (revealEditMenu) map.off('move', revealEditMenu);
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
        tipHtml: helpHtml('intro.buildings.retry_square'),
        buttonText: t.html('intro.ok'),
        buttonCallback: () => resolve(rightClickHouseAsync)
      });
    });
  }


  // "See how the corners of the building moved into place? Let's learn another useful trick."
  // Click Ok to advance
  function doneSquareAsync() {
    history.checkpoint('doneSquare');

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealExtent: houseExtent,
        tipHtml: helpHtml('intro.buildings.done_square'),
        buttonText: t.html('intro.ok'),
        buttonCallback: () => resolve(addTankAsync)
      });
    });
  }


  // "Next we'll trace this circular storage tank..."
  // Click Add Area to advance
  function addTankAsync() {
    context.enter('browse');
    history.reset('doneSquare');
    _tankID = null;

    const loc = tankExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setCenterZoomAsync(loc, 19.5, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        curtain.reveal({
          revealSelector: 'button.draw-area',
          tipHtml: helpHtml('intro.buildings.add_tank')
        });
        context.on('enter.intro', () => resolve(startTankAsync));
      }))
      .finally(() => {
        context.on('enter.intro', null);
      });
  }


  // "Don't worry, you won't need to draw a perfect circle. Just draw an area inside the tank that touches its edge."
  // Place the first point to advance
  function startTankAsync() {
    if (context.mode().id !== 'draw-area') return Promise.resolve(addTankAsync);
    _tankID = null;

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      const textID = context.lastPointerType() === 'mouse' ? 'click' : 'tap';
      const startString = helpHtml('intro.buildings.start_tank') +
        helpHtml(`intro.buildings.tank_edge_${textID}`);

      curtain.reveal({
        revealExtent: tankExtent,
        tipHtml: startString
      });

      history.on('change.intro', difference => {
        if (!difference) return;
        for (const entity of difference.created()) {  // created a node and a way
          if (entity.type === 'way') {
            _tankID = entity.id;
            resolve(continueTankAsync);
          }
        }
      });

      context.on('enter.intro', reject);   // disallow mode change
    })
    .finally(() => {
      history.on('change.intro', null);
      context.on('enter.intro', null);
    });
  }


  // "Add a few more nodes around the edge. The circle will be created outside the nodes that you draw."
  // Enter Select mode to advance
  function continueTankAsync() {
    if (context.mode().id !== 'draw-area') return Promise.resolve(addTankAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      const textID = context.lastPointerType() === 'mouse' ? 'click' : 'tap';
      const continueString = helpHtml('intro.buildings.continue_tank') + '{br}' +
        helpHtml(`intro.areas.finish_area_${textID}`) + helpHtml('intro.buildings.finish_tank');

      curtain.reveal({
        revealExtent: tankExtent,
        tipHtml: continueString
      });

      context.on('enter.intro', () => {
        if (_doesTankExist() && _isTankSelected()) {
          resolve(searchPresetTankAsync);
        } else {
          reject();
        }
      });
    })
    .finally(() => {
      context.on('enter.intro', null);
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
        if (!_isTankSelected()) context.enter(modeSelect(context, [_tankID]));

        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        showPresetList(container);

        curtain.reveal({
          revealSelector: '.preset-search-input',
          tipHtml: helpHtml('intro.buildings.search_tank', { preset: tankPreset.name() })
        });

        container.select('.preset-search-input')
          .on('keydown.intro', null)
          .on('keyup.intro', _checkPresetSearch);


        // Get user to choose the Tank preset from the search result
        function _checkPresetSearch() {
          const first = container.select('.preset-list-item:first-child');
          if (!first.classed('preset-man_made-storage_tank')) return;

          curtain.reveal({
            revealNode: first.select('.preset-list-button').node(),
            revealPadding: 5,
            tipHtml: helpHtml('intro.buildings.choose_tank', { preset: tankPreset.name() })
          });

          container.select('.preset-search-input')
            .on('keydown.intro', eventCancel, true)   // no more typing
            .on('keyup.intro', null);
        }

        history.on('change.intro', difference => {
          if (!difference) return;
          const modified = difference.modified();
          if (modified.length === 1) {
            if (presetSystem.match(modified[0], context.graph()) === tankPreset) {
              resolve(hasTankAsync);
            } else {
              reject();  // didn't pick tank
            }
          }
        });

        context.on('enter.intro', reject);   // disallow mode change
      }))
      .finally(() => {
        history.on('change.intro', null);
        context.on('enter.intro', null);
        container.select('.inspector-wrap').on('wheel.intro', null);
        container.select('.preset-search-input').on('keydown.intro keyup.intro', null);
      });
  }


  // Set a history checkpoint here, so we can return back to it if needed
  function hasTankAsync() {
    if (!_doesTankExist()) return Promise.resolve(addTankAsync);

    // Make sure it's still a tank, in case user somehow changed it..
    const entity = context.entity(_tankID);
    const oldPreset = presetSystem.match(entity, context.graph());
    context.replace(actionChangePreset(_tankID, oldPreset, tankPreset));

    history.checkpoint('hasTank');
    return Promise.resolve(rightClickTankAsync);  // advance
  }


  // "Right-click to select the storage tank you created and show the edit menu."
  // Open the edit menu to advance
  function rightClickTankAsync() {
    if (!['browse', 'select'].includes(context.mode().id)) context.enter('browse');
    history.reset('hasTank');

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      const textID = (context.lastPointerType() === 'mouse') ? 'rightclick_tank' : 'edit_menu_tank_touch';
      curtain.reveal({
        revealExtent: tankExtent,
        tipHtml: helpHtml(`intro.buildings.${textID}`)
      });

      editMenu.on('toggled.intro', open => {
        if (open) resolve(clickCircleAsync);
      });

      history.on('change.intro', reject);  // disallow doing anything else
    })
    .finally(() => {
      editMenu.on('toggled.intro', null);
      history.on('change.intro', null);
    });
  }


  // "Press the Circularize button to make the tank a circle."
  // Circularize the tank to advance
  function clickCircleAsync() {
    const buttonNode = container.select('.edit-menu-item-circularize').node();
    if (!buttonNode) return Promise.resolve(rightClickTankAsync);   // no Circularize button, try again

    let revealEditMenu;

    return delayAsync()  // after edit menu fully visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesTankExist() || !_isTankSelected()) { resolve(rightClickTankAsync); return; }

        revealEditMenu = (duration = 0) => {
          const menuNode = container.select('.edit-menu').node();
          if (menuNode) {
            curtain.reveal({
              duration: duration,
              revealNode: menuNode,
              revealPadding: 50,
              tipHtml: helpHtml('intro.buildings.circle_tank')
            });
          } else {
            reject();   // menu has gone away - user scrolled it offscreen?
          }
        };

        revealEditMenu(250);             // first time revealing menu, transition curtain to the menu
        map.on('move', revealEditMenu);  // on map moves, have the curtain follow the menu immediately

        history.on('change.intro', () => {
          map.off('move', revealEditMenu);
          history.on('change.intro', null);
          curtain.reveal({ revealExtent: tankExtent });  // watch it change
          resolve();
        });

        context.on('enter.intro', reject);   // disallow mode change
      }))
      .then(delayAsync)   // wait for circularize transtion to complete
      .then(() => {       // then check undo annotation to see what the user did
        if (history.undoAnnotation() === t('operations.circularize.annotation.feature', { n: 1 })) {
          return playAsync;
        } else {
          return retryClickCircleAsync;
        }
      })
      .finally(() => {
        history.on('change.intro', null);
        context.on('enter.intro', null);
        if (revealEditMenu) map.off('move', revealEditMenu);
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
        tipHtml: helpHtml('intro.buildings.retry_circle'),
        buttonText: t.html('intro.ok'),
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
      tipHtml: helpHtml('intro.buildings.play', { next: t('intro.rapid.title') }),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
    return Promise.resolve();
  }


  chapter.enter = () => {
    _chapterCancelled = false;
    _rejectStep = null;

    runAsync(addHouseAsync)
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
