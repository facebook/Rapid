import { Extent } from '@rapid-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { presetManager } from '../../presets';
import { t } from '../../core/localizer';
import { actionChangePreset } from '../../actions/change_preset';
import { modeSelect } from '../../modes/select';
import { utilRebind } from '../../util/rebind';
import { delayAsync, eventCancel, helpHtml, icon, showEntityEditor, showPresetList, transitionTime } from './helper';


export function uiIntroPoint(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.points.title' };
  const editMenu = context.ui().editMenu();
  const container = context.container();
  const history = context.history();
  const map = context.map();

  const buildingExtent = new Extent([-85.63261, 41.94391], [-85.63222, 41.94419]);
  const cafePreset = presetManager.item('amenity/cafe');

  let _chapterCancelled = false;
  let _rejectStep = null;
  let _pointID = null;


  // Helper functions
  function _doesPointExist() {
    return _pointID && context.hasEntity(_pointID);
  }

  function _isPointSelected() {
    if (context.mode().id !== 'select') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === _pointID;
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


  // "Points can be used to represent features such as shops, restaurants, and monuments."
  // Click "Add Point" button to advance
  function addPointAsync() {
    context.enter('browse');
    history.reset('initial');
    _pointID = null;

    const loc = buildingExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setCenterZoomAsync(loc, 20, msec)   // bug: too hard to place a point in the building at z19 because of snapping to fill #719
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        const tooltip = curtain.reveal({
          revealSelector: 'button.add-point',
          tipHtml: helpHtml('intro.points.points_info') + '{br}' + helpHtml('intro.points.add_point')
        });

        tooltip.selectAll('.popover-inner')
          .insert('svg', 'span')
          .attr('class', 'tooltip-illustration')
          .append('use')
          .attr('xlink:href', '#rapid-graphic-points');

        context.on('enter.intro', () => resolve(placePointAsync));
      }))
      .finally(() => {
        context.on('enter.intro', null);
      });
  }


  // Place a point in the revealed rectangle to advance
  function placePointAsync() {
    if (context.mode().id !== 'add-point') return Promise.resolve(addPointAsync);
    _pointID = null;

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

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

      context.on('enter.intro', () => resolve(searchPresetAsync));
    })
    .finally(() => {
      history.on('change.intro', null);
      context.on('enter.intro', null);
    });
  }


  // "The point you just added is a cafe..."
  // Search for Cafe in the preset search to advance
  function searchPresetAsync() {
    return delayAsync()  // after preset pane visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesPointExist()) { resolve(addPointAsync); return; }
        if (!_isPointSelected()) context.enter(modeSelect(context, [_pointID]));

        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        showPresetList(container);

        curtain.reveal({
          revealSelector: '.preset-search-input',
          tipHtml: helpHtml('intro.points.search_cafe', { preset: cafePreset.name() })
        });

        container.select('.preset-search-input')
          .on('keydown.intro', null)
          .on('keyup.intro', _checkPresetSearch);


        // Get user to choose the Cafe preset from the search result
        function _checkPresetSearch() {
          const first = container.select('.preset-list-item:first-child');
          if (!first.classed('preset-amenity-cafe')) return;

          curtain.reveal({
            revealNode: first.select('.preset-list-button').node(),
            revealPadding: 5,
            tipHtml: helpHtml('intro.points.choose_cafe', { preset: cafePreset.name() })
          });

          container.select('.preset-search-input')
            .on('keydown.intro', eventCancel, true)   // no more typing
            .on('keyup.intro', null);
        }

        history.on('change.intro', difference => {
          if (!difference) return;
          const modified = difference.modified();
          if (modified.length === 1) {
            if (presetManager.match(modified[0], context.graph()) === cafePreset) {
              resolve(aboutFeatureEditorAsync);
            } else {
              reject();  // didn't pick cafe
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


  // "The point is now marked as a cafe. Using the feature editor, we can add more information about the cafe."
  // Click Ok to advance
  function aboutFeatureEditorAsync() {
    return delayAsync()  // after entity editor visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesPointExist()) { resolve(addPointAsync); return; }
        if (!_isPointSelected()) context.enter(modeSelect(context, [_pointID]));

        showEntityEditor(container);

        curtain.reveal({
          revealSelector: '.entity-editor-pane',
          tipHtml: helpHtml('intro.points.feature_editor'),
          tipClass: 'intro-points-describe',
          buttonText: t.html('intro.ok'),
          buttonCallback: () => resolve(addNameAsync)
        });

        // If user leaves select mode here, just continue with the tutorial.
        context.on('enter.intro', () => resolve(addNameAsync));
      }))
      .finally(() => {
        context.on('enter.intro', null);
      });
  }


  // "Let's pretend that you have local knowledge of this cafe, and you know its name..."
  // Make any edit to advance (or click Ok if they happend to add a name already)
  function addNameAsync() {
    return delayAsync()  // after entity editor visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesPointExist()) { resolve(addPointAsync); return; }
        if (!_isPointSelected()) context.enter(modeSelect(context, [_pointID]));

        showEntityEditor(container);

        // It's possible for the user to add a name in a previous step..
        // If so, don't tell them to add the name in this step.
        // Give them an OK button instead.
        const entity = context.hasEntity(_pointID);
        if (entity.tags.name) {
          const tooltip = curtain.reveal({
            revealSelector: '.entity-editor-pane',
            tipHtml: helpHtml('intro.points.fields_info'),
            buttonText: t.html('intro.ok'),
            buttonCallback: () => resolve(addCloseEditorAsync)
          });

          tooltip.select('.instruction').style('display', 'none');

        } else {
          curtain.reveal({
            revealSelector: '.entity-editor-pane',
            tipHtml: helpHtml('intro.points.fields_info') + '{br}' + helpHtml('intro.points.add_name'),
            tipClass: 'intro-points-describe'
          });
        }

        history.on('change.intro', () => resolve(addCloseEditorAsync));

        // If user leaves select mode here, just continue with the tutorial.
        context.on('enter.intro', () => resolve(hasPointAsync));
      }))
      .finally(() => {
        history.on('change.intro', null);
        context.on('enter.intro', null);
      });
  }


  // "The feature editor will remember all of your changes automatically..."
  // Close entity editor / leave select mode to advance
  function addCloseEditorAsync() {
    if (!_doesPointExist()) return Promise.resolve(addPointAsync);
    if (!_isPointSelected()) context.enter(modeSelect(context, [_pointID]));

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      showEntityEditor(container);

      const iconSelector = '.entity-editor-pane button.close svg use';
      const iconName = d3_select(iconSelector).attr('href') || '#rapid-icon-close';
      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.points.add_close', { button: icon(iconName, 'inline') })
      });

      context.on('enter.intro', () => resolve(hasPointAsync));
    })
    .finally(() => {
      history.on('change.intro', null);
      context.on('enter.intro', null);
    });
  }


  // Set a history checkpoint here, so we can return back to it if needed
  // The point exists and it is a cafe and it probably has a name.
  function hasPointAsync() {
    if (!_doesPointExist()) return Promise.resolve(addPointAsync);

    // Make sure it's still a cafe, in case user somehow changed it..
    const entity = context.entity(_pointID);
    const oldPreset = presetManager.match(entity, context.graph());
    context.replace(actionChangePreset(_pointID, oldPreset, cafePreset));

    history.checkpoint('hasPoint');
    return Promise.resolve(reselectPointAsync);  // advance
  }


  // "Often points will already exist, but have mistakes or be incomplete..."
  // Reselect the point to advance
  function reselectPointAsync() {
    context.enter('browse');
    history.reset('hasPoint');

    const loc = buildingExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setCenterZoomAsync(loc, 20, msec)   // bug: too hard to place a point in the building at z19 because of snapping to fill #719
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;

        curtain.reveal({
          revealExtent: buildingExtent,
          tipHtml: helpHtml('intro.points.reselect')
        });

        context.on('enter.intro', () => resolve(updatePointAsync));
      }))
      .finally(() => {
        context.on('enter.intro', null);
      });
  }


  // "Let's fill in some more details for this cafe..."
  // Make any edit to advance
  function updatePointAsync() {
    return delayAsync()  // after entity editor visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesPointExist() || !_isPointSelected()) { resolve(reselectPointAsync); return; }

        showEntityEditor(container);

        curtain.reveal({
          revealSelector: '.entity-editor-pane',
          tipHtml: helpHtml('intro.points.update'),
          tipClass: 'intro-points-describe'
        });

        history.on('change.intro', () => resolve(updateCloseEditorAsync));
        context.on('enter.intro', reject);   // disallow mode change
      }))
      .finally(() => {
        history.on('change.intro', null);
        context.on('enter.intro', null);
      });
 }


  // "When you are finished updating the cafe..."
  // Close Entity editor / leave select mode to advance
  function updateCloseEditorAsync() {
    if (!_doesPointExist() || !_isPointSelected()) return Promise.resolve(reselectPointAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      showEntityEditor(container);

      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.points.update_close', { button: icon('#rapid-icon-close', 'inline') })
      });

      context.on('enter.intro', () => resolve(rightClickPointAsync));
    })
    .finally(() => {
      context.on('enter.intro', null);
    });
  }


  // "You can right-click on any feature to see the edit menu..."
  // Open the edit menu to advance
  function rightClickPointAsync() {
    if (!_doesPointExist()) return Promise.resolve(reselectPointAsync);
    if (!['browse', 'select'].includes(context.mode().id)) context.enter('browse');

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      const textID = context.lastPointerType() === 'mouse' ? 'rightclick' : 'edit_menu_touch';
      curtain.reveal({
        revealExtent: buildingExtent,
        tipHtml: helpHtml(`intro.points.${textID}`)
      });

      editMenu.on('toggled.intro', open => {
        if (open) resolve(enterDeleteAsync);
      });

      history.on('change.intro', reject);  // disallow doing anything else
    })
    .finally(() => {
      editMenu.on('toggled.intro', null);
      history.on('change.intro', null);
    });
  }


  // "It's OK to delete features that don't exist in the real world..."
  // Delete the point to advance
  function enterDeleteAsync() {
    const node = container.select('.edit-menu-item-delete').node();
    if (!node) return Promise.resolve(rightClickPointAsync);   // no Delete button, try again

    return delayAsync()  // after edit menu fully visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesPointExist() || !_isPointSelected()) { resolve(rightClickPointAsync); return; }

        curtain.reveal({
          revealSelector: '.edit-menu',
          revealPadding: 50,
          tipHtml: helpHtml('intro.points.delete')
        });

        history.on('change.intro', difference => {
          if (!difference) return;
          const deleted = difference.deleted();
          if (deleted.length === 1 && deleted[0].id === _pointID) {
            resolve(undoAsync);
          }
        });

        context.on('enter.intro', () => {
          if (_doesPointExist()) reject();  // point still exists, try again
        });
      }))
      .finally(() => {
        history.on('change.intro', null);
        context.on('enter.intro', null);
      });
  }


  // "You can always undo any changes up until you save your edits to OpenStreetMap..."
  // Click undo to advance
  function undoAsync() {
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      curtain.reveal({
        revealSelector: '.top-toolbar button.undo-button',
        tipHtml: helpHtml('intro.points.undo')
      });
      history.on('change.intro', () => resolve(playAsync));
    })
    .finally(() => {
      history.on('change.intro', null);
    });
  }


  // Free play
  // Click on Areas (or another) chapter to advance
  function playAsync() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.ideditor',
      tipSelector: '.intro-nav-wrap .chapter-area',
      tipHtml: helpHtml('intro.points.play', { next: t('intro.areas.title') }),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
    return Promise.resolve();
  }


  chapter.enter = () => {
    _chapterCancelled = false;
    _rejectStep = null;

    runAsync(addPointAsync)
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
