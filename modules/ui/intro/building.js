import { Extent } from '@id-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { utilArrayUniq } from '@id-sdk/util';

import { presetManager } from '../../presets';
import { t } from '../../core/localizer';
import { modeSelect } from '../../modes/select';
import { utilRebind } from '../../util';
import { helpHtml, icon, isMostlySquare, transitionTime } from './helper';


export function uiIntroBuilding(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.buildings.title' };
  const container = context.container();
  const history = context.history();
  const map = context.map();

  const house = [-85.62815, 41.95638];
  const tank = [-85.62732, 41.95347];
  const buildingCatetory = presetManager.item('category-building');
  const housePreset = presetManager.item('building/house');
  const tankPreset = presetManager.item('man_made/storage_tank');

  let _timeouts = [];
  let _houseID = null;
  let _tankID = null;


  function timeout(fn, t) {
    _timeouts.push(window.setTimeout(fn, t));
  }


  function eventCancel(d3_event) {
    d3_event.stopPropagation();
    d3_event.preventDefault();
  }


  function addHouse() {
    context.enter('browse');
    history.reset('initial');
    _houseID = null;

    const msec = transitionTime(house, map.center());
    if (msec > 0) curtain.hide();
    map.centerZoomEase(house, 19, msec);

    timeout(() => {
      const tooltip = curtain.reveal({
        revealSelector: 'button.draw-area',
        tipHtml: helpHtml('intro.buildings.add_building')
      });

      tooltip.selectAll('.popover-inner')
        .insert('svg', 'span')
        .attr('class', 'tooltip-illustration')
        .append('use')
        .attr('xlink:href', '#iD-graphic-buildings');

      context.on('enter.intro', mode => {
        if (mode.id !== 'draw-area') return;
        continueTo(startHouse);
      });
    }, msec + 100);

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  function startHouse() {
    if (context.mode().id !== 'draw-area') {
      return continueTo(addHouse);
    }

    function onClick() {
      if (context.mode().id !== 'draw-area') return chapter.restart();
      continueTo(continueHouse);
    }

    _houseID = null;

    map.zoomEase(20, 500);
    timeout(() => {
      const startString = helpHtml('intro.buildings.start_building') +
        helpHtml('intro.buildings.building_corner_' + (context.lastPointerType() === 'mouse' ? 'click' : 'tap'));

      curtain.reveal({
        revealExtent: new Extent(house).padByMeters(20),
        tipHTML: startString
      });

      context.behaviors.get('draw').on('click', onClick);
    }, 550);  // after easing

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      context.behaviors.get('draw').off('click', onClick);
      nextStep();
    }
  }


  function continueHouse() {
    if (context.mode().id !== 'draw-area') {
      return continueTo(addHouse);
    }

    _houseID = null;

    const continueString = helpHtml('intro.buildings.continue_building') + '{br}' +
      helpHtml('intro.areas.finish_area_' + (context.lastPointerType() === 'mouse' ? 'click' : 'tap')) +
      helpHtml('intro.buildings.finish_building');

    curtain.reveal({
      revealExtent: new Extent(house).padByMeters(20),
      tipHTML: continueString
    });

    context.on('enter.intro', mode => {
      if (mode.id === 'draw-area') {
        return;

      } else if (mode.id === 'select') {
        const graph = context.graph();
        const way = context.entity(context.selectedIDs()[0]);
        const nodes = graph.childNodes(way);
        const points = utilArrayUniq(nodes).map(n => context.projection.project(n.loc));

        if (isMostlySquare(points)) {
          _houseID = way.id;
          return continueTo(chooseCategoryBuilding);
        } else {
          return continueTo(retryHouse);
        }

      } else {
        return chapter.restart();
      }
    });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  function retryHouse() {
    curtain.reveal({
      revealExtent: new Extent(house).padByMeters(20),
      tipHTML: helpHtml('intro.buildings.retry_building'),
      buttonText: t.html('intro.ok'),
      buttonCallback: addHouse
    });
 }


  function chooseCategoryBuilding() {
    if (!_houseID || !context.hasEntity(_houseID)) {
      return addHouse();
    }
    const ids = context.selectedIDs();
      if (context.mode().id !== 'select' || !ids.length || ids[0] !== _houseID) {
      context.enter(modeSelect(context, [_houseID]));
    }

    // disallow scrolling
    container.select('.inspector-wrap').on('wheel.intro', eventCancel);

    timeout(() => {
      // reset pane, in case user somehow happened to change it..
      container.select('.inspector-wrap .panewrap').style('right', '-100%');

      const button = container.select('.preset-category-building .preset-list-button');

      curtain.reveal({
        revealNode: button.node(),
        tipHtml: helpHtml('intro.buildings.choose_category_building', { category: buildingCatetory.name() })
      });

      button.on('click.intro', () => {
        button.on('click.intro', null);
        continueTo(choosePresetHouse);
      });

    }, 400);  // after preset list pane visible..


    context.on('enter.intro', mode => {
      if (!_houseID || !context.hasEntity(_houseID)) {
        return continueTo(addHouse);
      }
      const ids = context.selectedIDs();
      if (mode.id !== 'select' || !ids.length || ids[0] !== _houseID) {
        return continueTo(chooseCategoryBuilding);
      }
    });

    function continueTo(nextStep) {
      container.select('.inspector-wrap').on('wheel.intro', null);
      container.select('.preset-list-button').on('click.intro', null);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  function choosePresetHouse() {
    if (!_houseID || !context.hasEntity(_houseID)) {
      return addHouse();
    }

    const ids = context.selectedIDs();
      if (context.mode().id !== 'select' || !ids.length || ids[0] !== _houseID) {
      context.enter(modeSelect(context, [_houseID]));
    }

    const button = container.select('.preset-building-house .preset-list-button');

    // disallow scrolling
    container.select('.inspector-wrap').on('wheel.intro', eventCancel);

    timeout(() => {
      // reset pane, in case user somehow happened to change it..
      container.select('.inspector-wrap .panewrap').style('right', '-100%');

      curtain.reveal({
        revealNode: button.node(),
        tipHtml: helpHtml('intro.buildings.choose_preset_house', { preset: housePreset.name() })
      });

      button.on('click.intro', () => continueTo(closeEditorHouse));

    }, 400);  // after preset list pane visible..

    context.on('enter.intro', mode => {
      if (!_houseID || !context.hasEntity(_houseID)) {
        return continueTo(addHouse);
      }
      const ids = context.selectedIDs();
      if (mode.id !== 'select' || !ids.length || ids[0] !== _houseID) {
        return continueTo(chooseCategoryBuilding);
      }
    });

    function continueTo(nextStep) {
      container.select('.inspector-wrap').on('wheel.intro', null);
      container.select('.preset-list-button').on('click.intro', null);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  function closeEditorHouse() {
    if (!_houseID || !context.hasEntity(_houseID)) {
      return addHouse();
    }
    const ids = context.selectedIDs();
      if (context.mode().id !== 'select' || !ids.length || ids[0] !== _houseID) {
      context.enter(modeSelect(context, [_houseID]));
    }

    history.checkpoint('hasHouse');
    context.on('exit.intro', () => continueTo(rightClickHouse));

    timeout(() => {
      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.buildings.close', { button: icon('#iD-icon-close', 'inline') })
      });
    }, 500);

    function continueTo(nextStep) {
      context.on('exit.intro', null);
      nextStep();
    }
  }


  function rightClickHouse() {
    if (!_houseID) return chapter.restart();

    context.enter('browse');
    history.reset('hasHouse');

    let zoom = map.zoom();
    if (zoom < 20) {
      zoom = 20;
      map.centerZoomEase(house, zoom, 500);
    }

    if (context.selectedIDs().indexOf(_houseID) === -1) {
      context.enter(modeSelect(context, [_houseID]));
    }

    const ids = context.selectedIDs();
    if (ids.length !== 1 || ids[0] !== _houseID) return;

    const textID = (context.lastPointerType() === 'mouse') ? 'rightclick_building' : 'edit_menu_building_touch';
    curtain.reveal({
      revealExtent: new Extent(house).padByMeters(20),
      tipHTML: helpHtml(`intro.buildings.${textID}`)
    });

    timeout(() => {
      const node = container.select('.edit-menu-item-orthogonalize').node();
      if (!node) return;
      continueTo(clickSquare);
    }, 50);  // after menu visible


    context.ui().editMenu().on('toggled.intro', open => {
      if (!open) return;

      timeout(() => {
        const ids = context.selectedIDs();
        if (ids.length === 1 && ids.indexOf(_houseID) !== -1) {
          return continueTo(clickSquare);
        } else {
          return continueTo(rightClickHouse);
        }
      }, 300);  // after edit menu visible
    });

    history.on('change.intro', () => continueTo(rightClickHouse));

    function continueTo(nextStep) {
      context.ui().editMenu().on('toggled.intro', null);
      context.on('enter.intro', null);
      history.on('change.intro', null);
      nextStep();
    }
  }


  function clickSquare() {
    if (!_houseID) return chapter.restart();
    const entity = context.hasEntity(_houseID);
    if (!entity) return continueTo(rightClickHouse);

    const node = container.select('.edit-menu-item-orthogonalize').node();
    if (!node) { return continueTo(rightClickHouse); }

    const revealEditMenu = () => {
      curtain.reveal({
        revealSelector: '.edit-menu',
        revealPadding: 50,
        tipHtml: helpHtml('intro.buildings.square_building')
      });
    };

    revealEditMenu();
    map.on('move', revealEditMenu);

    context.on('enter.intro', mode => {
      if (mode.id === 'browse') {
        continueTo(rightClickHouse);
      } else if (mode.id === 'move' || mode.id === 'rotate') {
        continueTo(retryClickSquare);
      }
    });

    history.on('change.intro', () => {
      history.on('change.intro', null);

      // Something changed.  Wait for transition to complete and check undo annotation.
      timeout(() => {
        if (history.undoAnnotation() === t('operations.orthogonalize.annotation.feature', { n: 1 })) {
          continueTo(doneSquare);
        } else {
          continueTo(retryClickSquare);
        }
      }, 500);  // after transitioned actions
    });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      map.off('move', revealEditMenu);
      history.on('change.intro', null);
      nextStep();
    }
  }


  function retryClickSquare() {
    context.enter('browse');
    curtain.reveal({
      revealExtent: new Extent(house).padByMeters(20),
      tipHTML: helpHtml('intro.buildings.retry_square'),
      buttonText: t.html('intro.ok'),
      buttonCallback: rightClickHouse
    });
  }


  function doneSquare() {
    history.checkpoint('doneSquare');
    curtain.reveal({
      revealExtent: new Extent(house).padByMeters(20),
      tipHTML: helpHtml('intro.buildings.done_square'),
      buttonText: t.html('intro.ok'),
      buttonCallback: addTank
    });
  }


  function addTank() {
    context.enter('browse');
    history.reset('doneSquare');
    _tankID = null;

    const msec = transitionTime(tank, map.center());
    map.centerZoomEase(tank, 19.5, msec);

    timeout(() => {
      curtain.reveal({
        revealSelector: 'button.draw-area',
        tipHtml: helpHtml('intro.buildings.add_tank')
      });

      context.on('enter.intro', mode => {
        if (mode.id !== 'draw-area') return;
        continueTo(startTank);
      });
    }, msec + 100);

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  function startTank() {
    if (context.mode().id !== 'draw-area') {
      return continueTo(addTank);
    }

    _tankID = null;

    timeout(() => {
      const startString = helpHtml('intro.buildings.start_tank') +
        helpHtml('intro.buildings.tank_edge_' + (context.lastPointerType() === 'mouse' ? 'click' : 'tap'));

      curtain.reveal({
        revealExtent: new Extent(tank).padByMeters(20),
        tipHTML: startString
      });

    }, 550);  // after easing


    function onClick() {
      if (context.mode().id !== 'draw-area') return chapter.restart();
      continueTo(continueTank);
    }

    context.behaviors.get('draw').on('click', onClick);

    function continueTo(nextStep) {
      context.behaviors.get('draw').off('click', onClick);
      nextStep();
    }
  }


  function continueTank() {
    if (context.mode().id !== 'draw-area') {
      return continueTo(addTank);
    }

    _tankID = null;

    const continueString = helpHtml('intro.buildings.continue_tank') + '{br}' +
      helpHtml('intro.areas.finish_area_' + (context.lastPointerType() === 'mouse' ? 'click' : 'tap')) +
      helpHtml('intro.buildings.finish_tank');

    curtain.reveal({
      revealExtent: new Extent(tank).padByMeters(20),
      tipHTML: continueString
    });

    context.on('enter.intro', mode => {
      if (mode.id === 'draw-area') {
        return;
      } else if (mode.id === 'select') {
        _tankID = context.selectedIDs()[0];
        return continueTo(searchPresetTank);
      } else {
        return continueTo(addTank);
      }
    });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  function searchPresetTank() {
    if (!_tankID || !context.hasEntity(_tankID)) {
      return addTank();
    }
    const ids = context.selectedIDs();
    if (context.mode().id !== 'select' || !ids.length || ids[0] !== _tankID) {
      context.enter(modeSelect(context, [_tankID]));
    }

    // disallow scrolling
    container.select('.inspector-wrap').on('wheel.intro', eventCancel);

    timeout(() => {
      // reset pane, in case user somehow happened to change it..
      container.select('.inspector-wrap .panewrap').style('right', '-100%');

      container.select('.preset-search-input')
        .on('keydown.intro', null)
        .on('keyup.intro', checkPresetSearch);

      curtain.reveal({
        revealSelector: '.preset-search-input',
        tipHtml: helpHtml('intro.buildings.search_tank', { preset: tankPreset.name() })
      });

    }, 400);  // after preset list pane visible..

    context.on('enter.intro', mode => {
      if (!_tankID || !context.hasEntity(_tankID)) {
        return continueTo(addTank);
      }

      const ids = context.selectedIDs();
      if (mode.id !== 'select' || !ids.length || ids[0] !== _tankID) {
        // keep the user's area selected..
        context.enter(modeSelect(context, [_tankID]));

        // reset pane, in case user somehow happened to change it..
        container.select('.inspector-wrap .panewrap').style('right', '-100%');
        // disallow scrolling
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);

        container.select('.preset-search-input')
          .on('keydown.intro', null)
          .on('keyup.intro', checkPresetSearch);

        curtain.reveal({
          revealSelector: '.preset-search-input',
          tipHtml: helpHtml('intro.buildings.search_tank', { preset: tankPreset.name() })
        });

        history.on('change.intro', null);
      }
    });

    function checkPresetSearch() {
      const first = container.select('.preset-list-item:first-child');
      if (!first.classed('preset-man_made-storage_tank')) return;

      curtain.reveal({
        revealNode: first.select('.preset-list-button').node(),
        tipHtml: helpHtml('intro.buildings.choose_tank', { preset: tankPreset.name() })
      });

      container.select('.preset-search-input')
        .on('keydown.intro', eventCancel, true)
        .on('keyup.intro', null);

      history.on('change.intro', () => continueTo(closeEditorTank));
    }

    function continueTo(nextStep) {
      container.select('.inspector-wrap').on('wheel.intro', null);
      context.on('enter.intro', null);
      history.on('change.intro', null);
      container.select('.preset-search-input').on('keydown.intro keyup.intro', null);
      nextStep();
    }
  }


  function closeEditorTank() {
    if (!_tankID || !context.hasEntity(_tankID)) {
      return addTank();
    }
    const ids = context.selectedIDs();
    if (context.mode().id !== 'select' || !ids.length || ids[0] !== _tankID) {
      context.enter(modeSelect(context, [_tankID]));
    }

    history.checkpoint('hasTank');

    context.on('exit.intro', () => continueTo(rightClickTank));

    timeout(() => {
      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.buildings.close', { button: icon('#iD-icon-close', 'inline') })
      });
    }, 500);

    function continueTo(nextStep) {
      context.on('exit.intro', null);
      nextStep();
    }
  }


  function rightClickTank() {
    if (!_tankID) return continueTo(addTank);

    context.enter('browse');
    history.reset('hasTank');
    map.centerEase(tank, 500);

    timeout(() => {
      context.on('enter.intro', mode => {
        if (mode.id !== 'select') return;

        const ids = context.selectedIDs();
        if (ids.length !== 1 || ids[0] !== _tankID) return;

        timeout(() => {
          const node = container.select('.edit-menu-item-circularize').node();
          if (!node) return;
          continueTo(clickCircle);
        }, 50);  // after menu visible
      });

      const textID = (context.lastPointerType() === 'mouse') ? 'rightclick_tank' : 'edit_menu_tank_touch';
      curtain.reveal({
        revealExtent: new Extent(tank).padByMeters(20),
        tipHTML: helpHtml(`intro.buildings.${textID}`)
      });

      history.on('change.intro', () => continueTo(rightClickTank));

    }, 600);

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      history.on('change.intro', null);
      nextStep();
    }
  }


  function clickCircle() {
    if (!_tankID) return chapter.restart();
    const entity = context.hasEntity(_tankID);
    if (!entity) return continueTo(rightClickTank);

    const node = container.select('.edit-menu-item-circularize').node();
    if (!node) { return continueTo(rightClickTank); }

    const revealEditMenu = () => {
      curtain.reveal({
        revealSelector: '.edit-menu',
        revealPadding: 50,
        tipHtml: helpHtml('intro.buildings.circle_tank')
      });
    };

    revealEditMenu();
    map.on('move', revealEditMenu);

    context.on('enter.intro', mode => {
      if (mode.id === 'browse') {
        continueTo(rightClickTank);
      } else if (mode.id === 'move' || mode.id === 'rotate') {
        continueTo(retryClickCircle);
      }
    });

    history.on('change.intro', () => {
      history.on('change.intro', null);

      // Something changed.  Wait for transition to complete and check undo annotation.
      timeout(() => {
        if (history.undoAnnotation() === t('operations.circularize.annotation.feature', { n: 1 })) {
          continueTo(play);
        } else {
          continueTo(retryClickCircle);
        }
      }, 500);  // after transitioned actions
    });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      map.off('move', revealEditMenu);
      history.on('change.intro', null);
      nextStep();
    }
  }


  function retryClickCircle() {
    context.enter('browse');
    curtain.reveal({
      revealExtent: new Extent(tank).padByMeters(20),
      tipHTML: helpHtml('intro.buildings.retry_circle'),
      buttonText: t.html('intro.ok'),
      buttonCallback: rightClickTank
    });
  }


  function play() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.ideditor',
      tipSelector: '.intro-nav-wrap .chapter-rapid',
      tipHtml: helpHtml('intro.buildings.play', { next: t('intro.rapid.title') }),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
  }


  chapter.enter = () => {
    addHouse();
  };


  chapter.exit = () => {
    _timeouts.forEach(window.clearTimeout);
    context.on('enter.intro exit.intro', null);
    history.on('change.intro', null);
    container.select('.inspector-wrap').on('wheel.intro', null);
    container.select('.preset-search-input').on('keydown.intro keyup.intro', null);
    container.select('.more-fields .combobox-input').on('click.intro', null);
  };


  chapter.restart = () => {
    chapter.exit();
    chapter.enter();
  };


  return utilRebind(chapter, dispatch, 'on');
}
