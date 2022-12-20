import { Extent } from '@id-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { presetManager } from '../../presets';
import { t } from '../../core/localizer';
import { actionChangePreset } from '../../actions/change_preset';
import { modeSelect } from '../../modes/select';
import { utilRebind } from '../../util/rebind';
import { helpHtml, icon, transitionTime } from './helper';


export function uiIntroPoint(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.points.title' };
  const editMenu = context.ui().editMenu();
  const container = context.container();
  const history = context.history();
  const map = context.map();

  const buildingExtent = new Extent([-85.63261, 41.94391], [-85.63222, 41.94419]);
  const cafePreset = presetManager.item('amenity/cafe');

  let _timeouts = [];
  let _pointID = null;


  function timeout(fn, t) {
    _timeouts.push(window.setTimeout(fn, t));
  }


  function eventCancel(d3_event) {
    d3_event.stopPropagation();
    d3_event.preventDefault();
  }


  // "Points can be used to represent features such as shops, restaurants, and monuments."
  // Click "Add Point" button to advance
  function addPoint() {
    context.enter('browse');
    history.reset('initial');
    _pointID = null;

    const loc = buildingExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();
 // bug: too hard to place a point in the building at z19 because of snapping to fill #719
    // map.centerZoomEase(loc, 19, msec);
    map.centerZoomEase(loc, 20, msec);

    timeout(() => {
      const tooltip = curtain.reveal({
        revealSelector: 'button.add-point',
        tipHtml: helpHtml('intro.points.points_info') + '{br}' + helpHtml('intro.points.add_point')
      });
      tooltip.selectAll('.popover-inner')
        .insert('svg', 'span')
        .attr('class', 'tooltip-illustration')
        .append('use')
        .attr('xlink:href', '#iD-graphic-points');

      context.on('enter.intro', mode => {
        if (mode.id !== 'add-point') return;
        continueTo(placePoint);
      });
    }, msec + 100);

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // Place a point in the revealed rectangle to advance
  function placePoint() {
    if (context.mode().id !== 'add-point') {
      return chapter.restart();
    }

    const textID = context.lastPointerType() === 'mouse' ? 'place_point' : 'place_point_touch';
    curtain.reveal({
      revealExtent: buildingExtent,
      tipHtml: helpHtml(`intro.points.${textID}`)
    });

    context.on('enter.intro', mode => {
      if (mode.id !== 'select') return chapter.restart();
      _pointID = context.mode().selectedIDs()[0];
      continueTo(searchPreset);
    });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "The point you just added is a cafe..."
  // Search for Cafe in the preset search to advance
  function searchPreset() {
    if (context.mode().id !== 'select' || !_pointID || !context.hasEntity(_pointID)) {
      return addPoint();
    }

    // disallow scrolling
    container.select('.inspector-wrap').on('wheel.intro', eventCancel);

    container.select('.preset-search-input')
      .on('keydown.intro', null)
      .on('keyup.intro', checkPresetSearch);

    curtain.reveal({
      revealSelector: '.preset-search-input',
      revealPadding: 5,
      tipHtml: helpHtml('intro.points.search_cafe', { preset: cafePreset.name() })
    });

    context.on('enter.intro', mode => {
      if (!_pointID || !context.hasEntity(_pointID)) {
        return continueTo(addPoint);
      }

      const ids = context.selectedIDs();
      if (mode.id !== 'select' || !ids.length || ids[0] !== _pointID) {
        // keep the user's point selected..
        context.enter(modeSelect(context, [_pointID]));

        // disallow scrolling
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);

        container.select('.preset-search-input')
          .on('keydown.intro', null)
          .on('keyup.intro', checkPresetSearch);

        curtain.reveal({
          revealSelector: '.preset-search-input',
          revealPadding: 5,
          tipHtml: helpHtml('intro.points.search_cafe', { preset: cafePreset.name() })
        });

        history.on('change.intro', null);
      }
    });

    // Get user to choose the Cafe preset from the search result
    function checkPresetSearch() {
      const first = container.select('.preset-list-item:first-child');

      if (first.classed('preset-amenity-cafe')) {
        container.select('.preset-search-input')
          .on('keydown.intro', eventCancel, true)
          .on('keyup.intro', null);

        curtain.reveal({
          revealNode: first.select('.preset-list-button').node(),
          revealPadding: 5,
          tipHtml: helpHtml('intro.points.choose_cafe', { preset: cafePreset.name() })
        });

        history.on('change.intro', () => continueTo(aboutFeatureEditor));
      }
    }

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      history.on('change.intro', null);
      container.select('.inspector-wrap').on('wheel.intro', null);
      container.select('.preset-search-input').on('keydown.intro keyup.intro', null);
      nextStep();
    }
  }


  // "The point is now marked as a cafe. Using the feature editor, we can add more information about the cafe."
  // Click Ok to advance
  function aboutFeatureEditor() {
    if (context.mode().id !== 'select' || !_pointID || !context.hasEntity(_pointID)) {
      return addPoint();
    }

    timeout(() => {
      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.points.feature_editor'),
        tipClass: 'intro-points-describe',
        buttonText: t.html('intro.ok'),
        buttonCallback: () => continueTo(addName)
      });
    }, 400);

    // if user leaves select mode here, just continue with the tutorial.
    context.on('exit.intro', () => continueTo(reselectPoint));

    function continueTo(nextStep) {
      context.on('exit.intro', null);
      nextStep();
    }
  }


  // "Let's pretend that you have local knowledge of this cafe, and you know its name..."
  // Make any edit to advance (or click Ok if they happend to add a name already)
  function addName() {
    if (context.mode().id !== 'select' || !_pointID || !context.hasEntity(_pointID)) {
      return addPoint();
    }

    // reset pane, in case user happened to change it..
    container.select('.inspector-wrap .panewrap').style('right', '0%');

    timeout(() => {
      // It's possible for the user to add a name in a previous step..
      // If so, don't tell them to add the name in this step.
      // Give them an OK button instead.
      const entity = context.entity(_pointID);
      if (entity.tags.name) {
        const tooltip = curtain.reveal({
          revealSelector: '.entity-editor-pane',
          tipHtml: helpHtml('intro.points.fields_info'),
          buttonText: t.html('intro.ok'),
          buttonCallback: () => continueTo(addCloseEditor)
        });

        tooltip.select('.instruction').style('display', 'none');

      } else {
        curtain.reveal({
          revealSelector: '.entity-editor-pane',
          tipHtml: helpHtml('intro.points.fields_info') + '{br}' + helpHtml('intro.points.add_name'),
          tipClass: 'intro-points-describe'
        });
      }
    }, 400);

    history.on('change.intro', () => continueTo(addCloseEditor));

    // if user leaves select mode here, just continue with the tutorial.
    context.on('exit.intro', () => continueTo(reselectPoint));

    function continueTo(nextStep) {
      context.on('exit.intro', null);
      history.on('change.intro', null);
      nextStep();
    }
  }


  // "The feature editor will remember all of your changes automatically..."
  // Close entity editor / leave select mode to advance
  function addCloseEditor() {
    // reset pane, in case user happened to change it..
    container.select('.inspector-wrap .panewrap').style('right', '0%');

    const iconSelector = '.entity-editor-pane button.close svg use';
    const iconName = d3_select(iconSelector).attr('href') || '#iD-icon-close';

    context.on('exit.intro', () => continueTo(reselectPoint));

    curtain.reveal({
      revealSelector: '.entity-editor-pane',
      tipHtml: helpHtml('intro.points.add_close', { button: icon(iconName, 'inline') })
    });

    function continueTo(nextStep) {
      context.on('exit.intro', null);
      nextStep();
    }
  }


  // "Often points will already exist, but have mistakes or be incomplete..."
  // Reselect the point to advance
  function reselectPoint() {
    if (!_pointID) return chapter.restart();
    const entity = context.hasEntity(_pointID);
    if (!entity) return chapter.restart();

    // make sure it's still a cafe, in case user somehow changed it..
    const oldPreset = presetManager.match(entity, context.graph());
    context.replace(actionChangePreset(_pointID, oldPreset, cafePreset));

    context.enter('browse');

    const loc = buildingExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();
 // bug: too hard to place a point in the building at z19 because of snapping to fill #719
    // map.centerZoomEase(loc, 19, msec);
    map.centerZoomEase(loc, 20, msec);

    timeout(() => {
      curtain.reveal({
        revealExtent: buildingExtent,
        tipHtml: helpHtml('intro.points.reselect')
      });

      context.on('enter.intro', mode => {
        if (mode.id !== 'select') return;
        continueTo(updatePoint);
      });

    }, msec + 100);

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Let's fill in some more details for this cafe..."
  // Make any edit to advance
  function updatePoint() {
    if (context.mode().id !== 'select' || !_pointID || !context.hasEntity(_pointID)) {
      return continueTo(reselectPoint);
    }

    // reset pane, in case user happened to untag the point..
    container.select('.inspector-wrap .panewrap').style('right', '0%');

    context.on('exit.intro', () => continueTo(reselectPoint));
    history.on('change.intro', () => continueTo(updateCloseEditor));

    timeout(() => {
      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.points.update'),
        tipClass: 'intro-points-describe'
      });
    }, 400);

    function continueTo(nextStep) {
      context.on('exit.intro', null);
      history.on('change.intro', null);
      nextStep();
    }
  }


  // "When you are finished updating the cafe..."
  // Close Entity editor / leave select mode to advance
  function updateCloseEditor() {
    if (context.mode().id !== 'select' || !_pointID || !context.hasEntity(_pointID)) {
      return continueTo(reselectPoint);
    }

    // reset pane, in case user happened to change it..
    container.select('.inspector-wrap .panewrap').style('right', '0%');

    context.on('exit.intro', () => continueTo(rightClickPoint));

    timeout(() => {
      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.points.update_close', { button: icon('#iD-icon-close', 'inline') })
      });
    }, 500);

    function continueTo(nextStep) {
      context.on('exit.intro', null);
      nextStep();
    }
  }


  // "You can right-click on any feature to see the edit menu..."
  // Select point with edit menu open to advance
  function rightClickPoint() {
    if (!_pointID || !context.hasEntity(_pointID)) return chapter.restart();
    context.enter('browse');

    const textID = context.lastPointerType() === 'mouse' ? 'rightclick' : 'edit_menu_touch';
    curtain.reveal({
      revealExtent: buildingExtent,
      tipHtml: helpHtml(`intro.points.${textID}`)
    });

    editMenu.on('toggled.intro', open => {
      if (!open) return;

      timeout(() => {
        if (context.mode().id !== 'select') return;
        const ids = context.selectedIDs();
        if (ids.length !== 1 || ids[0] !== _pointID) return;
        if (container.select('.edit-menu-item-delete').empty()) return;
        continueTo(enterDelete);
      }, 300);  // after edit menu visible
    });

    function continueTo(nextStep) {
      editMenu.on('toggled.intro', null);
      nextStep();
    }
  }


  // "It's OK to delete features that don't exist in the real world..."
  // Delete the point to advance
  function enterDelete() {
    if (!_pointID || !context.hasEntity(_pointID)) return chapter.restart();

    const node = container.select('.edit-menu-item-delete').node();
    if (!node) { return continueTo(rightClickPoint); }

    curtain.reveal({
      revealSelector: '.edit-menu',
      revealPadding: 50,
      tipHtml: helpHtml('intro.points.delete')
    });

    context.on('exit.intro', () => {
      if (!_pointID) return chapter.restart();
      const entity = context.hasEntity(_pointID);
      if (entity) return continueTo(rightClickPoint);  // point still exists
    });

    history.on('change.intro', changed => {
      if (changed.deleted().length) {
        continueTo(undo);
      }
    });

    function continueTo(nextStep) {
      history.on('change.intro', null);
      context.on('exit.intro', null);
      nextStep();
    }
  }


  // "You can always undo any changes up until you save your edits to OpenStreetMap..."
  // Click undo to advance
  function undo() {
    history.on('change.intro', () => continueTo(play));

    curtain.reveal({
      revealSelector: '.top-toolbar button.undo-button',
      revealPadding: 5,
      tipHtml: helpHtml('intro.points.undo')
    });

    function continueTo(nextStep) {
      history.on('change.intro', null);
      nextStep();
    }
  }


  // Free play
  // Click on Areas (or another) chapter to advance
  function play() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.ideditor',
      tipSelector: '.intro-nav-wrap .chapter-area',
      tipHtml: helpHtml('intro.points.play', { next: t('intro.areas.title') }),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
  }


  chapter.enter = () => {
    addPoint();
  };


  chapter.exit = () => {
    _timeouts.forEach(window.clearTimeout);
    context.on('enter.intro exit.intro', null);
    history.on('change.intro', null);
    editMenu.on('toggled.intro', null);
    container.select('.inspector-wrap').on('wheel.intro', null);
    container.select('.preset-search-input').on('keydown.intro keyup.intro', null);
  };


  chapter.restart = () => {
    chapter.exit();
    chapter.enter();
  };


  return utilRebind(chapter, dispatch, 'on');
}
