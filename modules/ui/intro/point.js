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


  // Helper function to make sure the point exists
  function _doesPointExist() {
    return _pointID && context.hasEntity(_pointID);
  }

  // Helper function to make sure the point is selected
  function _isPointSelected() {
    if (context.mode().id !== 'select') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === _pointID;
  }

  // Helper function to force the entity inspector open
  // These things happen automatically but we want to be sure
  function _showEntityEditor() {
    container.select('.inspector-wrap .entity-editor-pane').classed('hide', false);
    container.select('.inspector-wrap .panewrap').style('right', '0%');
  }

  // Helper function to force the preset list open
  // These things happen automatically but we want to be sure
  function _showPresetList() {
    container.select('.inspector-wrap .entity-editor-pane').classed('hide', true);
    container.select('.inspector-wrap .panewrap').style('right', '-100%');
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

    map
      .setCenterZoomAsync(loc, 20, msec)   // bug: too hard to place a point in the building at z19 because of snapping to fill #719
      .then(() => {
        const tooltip = curtain.reveal({
          revealSelector: 'button.add-point',
          tipHtml: helpHtml('intro.points.points_info') + '{br}' + helpHtml('intro.points.add_point')
        });

        tooltip.selectAll('.popover-inner')
          .insert('svg', 'span')
          .attr('class', 'tooltip-illustration')
          .append('use')
          .attr('xlink:href', '#iD-graphic-points');
      });

    context.on('enter.intro', () => continueTo(placePoint));

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // Place a point in the revealed rectangle to advance
  function placePoint() {
    if (context.mode().id !== 'add-point') return continueTo(addPoint);
    _pointID = null;

    const textID = (context.lastPointerType() === 'mouse') ? 'place_point' : 'place_point_touch';
    curtain.reveal({
      revealExtent: buildingExtent,
      tipHtml: helpHtml(`intro.points.${textID}`)
    });

    history.on('change.intro', difference => {
      if (!difference) return;
      const created = difference.created();
      if (created.length === 1) {
        _pointID = created[0].id;
      }
    });

    context.on('enter.intro', () => continueTo(searchPreset));

    function continueTo(nextStep) {
      history.on('change.intro', null);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "The point you just added is a cafe..."
  // Search for Cafe in the preset search to advance
  function searchPreset() {
    if (!_doesPointExist()) return continueTo(addPoint);
    if (!_isPointSelected()) context.enter(modeSelect(context, [_pointID]));

    // disallow scrolling
    container.select('.inspector-wrap').on('wheel.intro', eventCancel);

    timeout(() => {
      _showPresetList();

      container.select('.preset-search-input')
        .on('keydown.intro', null)
        .on('keyup.intro', checkPresetSearch);

      curtain.reveal({
        revealSelector: '.preset-search-input',
        revealPadding: 5,
        tipHtml: helpHtml('intro.points.search_cafe', { preset: cafePreset.name() })
      });
    }, 400);  // after preset list pane visible..


    // Get user to choose the Cafe preset from the search result
    function checkPresetSearch() {
      const first = container.select('.preset-list-item:first-child');
      if (!first.classed('preset-amenity-cafe')) return;

      curtain.reveal({
        revealNode: first.select('.preset-list-button').node(),
        revealPadding: 5,
        tipHtml: helpHtml('intro.points.choose_cafe', { preset: cafePreset.name() })
      });

      container.select('.preset-search-input')
        .on('keydown.intro', eventCancel, true)
        .on('keyup.intro', null);
    }

    history.on('change.intro', difference => {
      if (!difference) return;
      const modified = difference.modified();
      if (modified.length === 1) {
        if (presetManager.match(modified[0], context.graph()) === cafePreset) {
          return continueTo(aboutFeatureEditor);
        } else {
          return continueTo(addPoint);  // didn't pick cafe
        }
      }
    });

    context.on('enter.intro', () => continueTo(addPoint));

    function continueTo(nextStep) {
      history.on('change.intro', null);
      context.on('enter.intro', null);
      container.select('.inspector-wrap').on('wheel.intro', null);
      container.select('.preset-search-input').on('keydown.intro keyup.intro', null);
      nextStep();
    }
  }


  // "The point is now marked as a cafe. Using the feature editor, we can add more information about the cafe."
  // Click Ok to advance
  function aboutFeatureEditor() {
    if (!_doesPointExist()) return continueTo(addPoint);
    if (!_isPointSelected()) context.enter(modeSelect(context, [_pointID]));

    timeout(() => {
      _showEntityEditor();

      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.points.feature_editor'),
        tipClass: 'intro-points-describe',
        buttonText: t.html('intro.ok'),
        buttonCallback: () => continueTo(addName)
      });
    }, 400);

    // If user leaves select mode here, just continue with the tutorial.
    context.on('enter.intro', () => continueTo(hasPoint));

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Let's pretend that you have local knowledge of this cafe, and you know its name..."
  // Make any edit to advance (or click Ok if they happend to add a name already)
  function addName() {
    if (!_doesPointExist()) return continueTo(addPoint);
    if (!_isPointSelected()) context.enter(modeSelect(context, [_pointID]));

    timeout(() => {
      _showEntityEditor();

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

    // If user leaves select mode here, just continue with the tutorial.
    context.on('enter.intro', () => continueTo(hasPoint));

    function continueTo(nextStep) {
      history.on('change.intro', null);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "The feature editor will remember all of your changes automatically..."
  // Close entity editor / leave select mode to advance
  function addCloseEditor() {
    if (!_doesPointExist()) return continueTo(addPoint);
    if (!_isPointSelected()) context.enter(modeSelect(context, [_pointID]));

    timeout(() => {
      _showEntityEditor();

      const iconSelector = '.entity-editor-pane button.close svg use';
      const iconName = d3_select(iconSelector).attr('href') || '#iD-icon-close';
      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.points.add_close', { button: icon(iconName, 'inline') })
      });
    }, 400);

    context.on('enter.intro', () => continueTo(hasPoint));

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // Set a history checkpoint here, so we can return back to it if needed
  // The point exists and it is a cafe and it probably has a name.
  function hasPoint() {
    if (!_doesPointExist()) return addPoint();

    // Make sure it's still a cafe, in case user somehow changed it..
    const entity = context.entity(_pointID);
    const oldPreset = presetManager.match(entity, context.graph());
    context.replace(actionChangePreset(_pointID, oldPreset, cafePreset));

    history.checkpoint('hasPoint');
    reselectPoint();  // advance
  }


  // "Often points will already exist, but have mistakes or be incomplete..."
  // Reselect the point to advance
  function reselectPoint() {
    context.enter('browse');
    history.reset('hasPoint');

    const loc = buildingExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    map
      .setCenterZoomAsync(loc, 20, msec)   // bug: too hard to place a point in the building at z19 because of snapping to fill #719
      .then(() => {
        curtain.reveal({
          revealExtent: buildingExtent,
          tipHtml: helpHtml('intro.points.reselect')
        });
      });

    context.on('enter.intro', () => continueTo(updatePoint));

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Let's fill in some more details for this cafe..."
  // Make any edit to advance
  function updatePoint() {
    if (!_doesPointExist() || !_isPointSelected()) return continueTo(reselectPoint);

    timeout(() => {
      _showEntityEditor();

      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.points.update'),
        tipClass: 'intro-points-describe'
      });
    }, 400);

    history.on('change.intro', () => continueTo(updateCloseEditor));
    context.on('enter.intro', () => continueTo(reselectPoint));

    function continueTo(nextStep) {
      history.on('change.intro', null);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "When you are finished updating the cafe..."
  // Close Entity editor / leave select mode to advance
  function updateCloseEditor() {
    if (!_doesPointExist() || !_isPointSelected()) return continueTo(reselectPoint);

    timeout(() => {
      _showEntityEditor();

      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.points.update_close', { button: icon('#iD-icon-close', 'inline') })
      });
    }, 400);

    context.on('enter.intro', () => continueTo(rightClickPoint));

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "You can right-click on any feature to see the edit menu..."
  // Select point with edit menu open to advance
  function rightClickPoint() {
    if (!_doesPointExist()) return continueTo(reselectPoint);
    context.enter('browse');

    const textID = context.lastPointerType() === 'mouse' ? 'rightclick' : 'edit_menu_touch';
    curtain.reveal({
      revealExtent: buildingExtent,
      tipHtml: helpHtml(`intro.points.${textID}`)
    });

    editMenu.on('toggled.intro', open => {
      if (!open) return;
      timeout(() => {
        if (!_isPointSelected()) {
          return continueTo(rightClickPoint);  // right clicked the wrong thing, try again
        } else if (container.select('.edit-menu-item-delete').empty()) {
          return continueTo(rightClickPoint);  // no delete button, try again
        } else {
          return continueTo(enterDelete);
        }
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
    if (!_doesPointExist() || !_isPointSelected()) return continueTo(rightClickPoint);

    const node = container.select('.edit-menu-item-delete').node();
    if (!node) return continueTo(rightClickPoint);   // no delete button, try again

    curtain.reveal({
      revealSelector: '.edit-menu',
      revealPadding: 50,
      tipHtml: helpHtml('intro.points.delete')
    });

    history.on('change.intro', difference => {
      if (!difference) return;
      const deleted = difference.deleted();
      if (deleted.length === 1 && deleted[0].id === _pointID) {
        return continueTo(undo);
      }
    });

    context.on('enter.intro', () => {
      if (_doesPointExist()) {
        return continueTo(rightClickPoint);  // point still exists, try again
      }
    });

    function continueTo(nextStep) {
      history.on('change.intro', null);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "You can always undo any changes up until you save your edits to OpenStreetMap..."
  // Click undo to advance
  function undo() {
    curtain.reveal({
      revealSelector: '.top-toolbar button.undo-button',
      revealPadding: 5,
      tipHtml: helpHtml('intro.points.undo')
    });

    history.on('change.intro', () => continueTo(play));

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
    history.on('change.intro', null);
    context.on('enter.intro', null);
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
