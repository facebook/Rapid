import { Extent } from '@rapid-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { actionChangePreset } from '../../actions/change_preset.js';
import { utilRebind } from '../../util/rebind.js';
import { delayAsync, eventCancel, helpHtml, icon, transitionTime } from './helper.js';


export function uiIntroPoint(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.points.title' };
  const container = context.container();
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const presets = context.systems.presets;
  const ui = context.systems.ui;
  const editMenu = ui.editMenu;

  const buildingExtent = new Extent([-85.63261, 41.94391], [-85.63222, 41.94419]);
  const cafePreset = presets.item('amenity/cafe');

  let _chapterCancelled = false;
  let _rejectStep = null;
  let _onModeChange = null;
  let _onStableChange = null;
  let _onStagingChange = null;
  let _pointID = null;


  // Helper functions
  function _doesPointExist() {
    const graph = editor.staging.graph;
    return _pointID && graph.hasEntity(_pointID);
  }

  function _isPointSelected() {
    if (context.mode?.id !== 'select-osm') return false;
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
    editor.restoreCheckpoint('initial');
    _pointID = null;

    const loc = buildingExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setMapParamsAsync(loc, 20, 0, msec)   // bug: too hard to place a point in the building at z19 because of snapping to fill #719
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        _onModeChange = () => resolve(placePointAsync);

        const tooltip = curtain.reveal({
          revealSelector: 'button.add-point',
          tipHtml: helpHtml(context, 'intro.points.points_info') + '{br}' + helpHtml(context, 'intro.points.add_point')
        });

        tooltip.selectAll('.popover-inner')
          .insert('svg', 'span')
          .attr('class', 'tooltip-illustration')
          .append('use')
          .attr('xlink:href', '#rapid-graphic-points');
      }))
      .finally(() => {
        _onModeChange = null;
      });
  }


  // Place a point in the revealed rectangle to advance
  function placePointAsync() {
    if (context.mode?.id !== 'add-point') return Promise.resolve(addPointAsync);
    _pointID = null;

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = () => resolve(searchPresetAsync);
      _onStableChange = (difference) => {
        const created = difference.created();
        if (created.length === 1) {
          _pointID = created[0].id;
        }
      };

      const textID = (context.lastPointerType === 'mouse') ? 'place_point' : 'place_point_touch';
      curtain.reveal({
        revealExtent: buildingExtent,
        tipHtml: helpHtml(context, `intro.points.${textID}`)
      });
    })
    .finally(() => {
      _onModeChange = null;
      _onStableChange = null;
    });
  }


  // "The point you just added is a cafe..."
  // Search for Cafe in the preset search to advance
  function searchPresetAsync() {
    return delayAsync()  // after preset pane visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesPointExist()) { resolve(addPointAsync); return; }
        if (!_isPointSelected()) context.enter('select-osm', { selection: { osm: [_pointID] }});

        _onModeChange = reject;  // disallow mode change
        _onStableChange = (difference) => {
          const modified = difference.modified();
          if (modified.length === 1) {
            const graph = editor.staging.graph;
            if (presets.match(modified[0], graph) === cafePreset) {
              resolve(aboutFeatureEditorAsync);
            } else {
              reject();  // didn't pick cafe
            }
          }
        };

        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        ui.sidebar.showPresetList();

        curtain.reveal({
          revealSelector: '.preset-search-input',
          tipHtml: helpHtml(context, 'intro.points.search_cafe', { preset: cafePreset.name() })
        });

        container.select('.preset-search-input')
          .on('keydown.intro', null)
          .on('keyup.intro', _checkPresetSearch);


        // Get user to choose the Cafe preset from the search result
        function _checkPresetSearch() {
          const first = container.select('.preset-list-item:first-child');
          if (!first.classed('preset-amenity_cafe')) return;

          curtain.reveal({
            revealNode: first.select('.preset-list-button').node(),
            revealPadding: 5,
            tipHtml: helpHtml(context, 'intro.points.choose_cafe', { preset: cafePreset.name() })
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


  // "The point is now marked as a cafe. Using the feature editor, we can add more information about the cafe."
  // Click Ok to advance
  function aboutFeatureEditorAsync() {
    return delayAsync()  // after entity editor visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesPointExist()) { resolve(addPointAsync); return; }
        if (!_isPointSelected()) context.enter('select-osm', { selection: { osm: [_pointID] }});

        // If user leaves select mode here, just continue with the tutorial.
        _onModeChange = () => resolve(addNameAsync);

        ui.sidebar.showEntityEditor();

        curtain.reveal({
          revealSelector: '.entity-editor-pane',
          tipHtml: helpHtml(context, 'intro.points.feature_editor'),
          tipClass: 'intro-points-describe',
          buttonText: l10n.t('intro.ok'),
          buttonCallback: () => resolve(addNameAsync)
        });
      }))
      .finally(() => {
        _onModeChange = null;
      });
  }


  // "Let's pretend that you have local knowledge of this cafe, and you know its name..."
  // Make any edit to advance (or click Ok if they happened to add a name already)
  function addNameAsync() {
    return delayAsync()  // after entity editor visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesPointExist()) { resolve(addPointAsync); return; }
        if (!_isPointSelected()) context.enter('select-osm', { selection: { osm: [_pointID] }});

        // If user leaves select mode here, just continue with the tutorial.
        _onModeChange = () => resolve(hasPointAsync);
        _onStagingChange = () => resolve(addCloseEditorAsync);

        ui.sidebar.showEntityEditor();

        // It's possible for the user to add a name in a previous step..
        // If so, don't tell them to add the name in this step.
        // Give them an OK button instead.
        const graph = editor.staging.graph;
        const entity = graph.hasEntity(_pointID);
        if (entity.tags.name) {
          const tooltip = curtain.reveal({
            revealSelector: '.entity-editor-pane',
            tipHtml: helpHtml(context, 'intro.points.fields_info'),
            buttonText: l10n.t('intro.ok'),
            buttonCallback: () => resolve(addCloseEditorAsync)
          });

          tooltip.select('.instruction').style('display', 'none');

        } else {
          curtain.reveal({
            revealSelector: '.entity-editor-pane',
            tipHtml: helpHtml(context, 'intro.points.fields_info') + '{br}' + helpHtml(context, 'intro.points.add_name'),
            tipClass: 'intro-points-describe'
          });
        }
      }))
      .finally(() => {
        _onModeChange = null;
        _onStagingChange = null;
      });
  }


  // "The feature editor will remember all of your changes automatically..."
  // Close entity editor / leave select mode to advance
  function addCloseEditorAsync() {
    if (!_doesPointExist()) return Promise.resolve(addPointAsync);
    if (!_isPointSelected()) context.enter('select-osm', { selection: { osm: [_pointID] }});

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = () => resolve(hasPointAsync);

      ui.sidebar.showEntityEditor();

      const iconSelector = '.entity-editor-pane button.close svg use';
      const iconName = d3_select(iconSelector).attr('href') || '#rapid-icon-close';
      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml(context, 'intro.points.add_close', { button: icon(iconName, 'inline') })
      });
    })
    .finally(() => {
      _onModeChange = null;
    });
  }


  // Set a checkpoint here, so we can return back to it if needed
  // The point exists and it is a cafe and it probably has a name.
  function hasPointAsync() {
    if (!_doesPointExist()) return Promise.resolve(addPointAsync);

    // Make sure it's still a cafe, in case user somehow changed it..
    const graph = editor.staging.graph;
    const entity = graph.entity(_pointID);
    const preset = presets.match(entity, graph);
    if (preset !== cafePreset) {
      editor.perform(actionChangePreset(_pointID, preset, cafePreset));
      editor.commit({
        annotation: l10n.t('operations.change_tags.annotation'),
        selectedIDs: [_pointID]
      });
    }

    editor.setCheckpoint('hasPoint');
    return Promise.resolve(reselectPointAsync);  // advance
  }


  // "Often points will already exist, but have mistakes or be incomplete..."
  // Reselect the point to advance
  function reselectPointAsync() {
    context.enter('browse');
    editor.restoreCheckpoint('hasPoint');

    const loc = buildingExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setMapParamsAsync(loc, 20, undefined, msec)   // bug: too hard to place a point in the building at z19 because of snapping to fill #719
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        _onModeChange = () => resolve(updatePointAsync);

        curtain.reveal({
          revealExtent: buildingExtent,
          tipHtml: helpHtml(context, 'intro.points.reselect')
        });
      }))
      .finally(() => {
        _onModeChange = null;
      });
  }


  // "Let's fill in some more details for this cafe..."
  // Make any edit to advance
  function updatePointAsync() {
    return delayAsync()  // after entity editor visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesPointExist() || !_isPointSelected()) { resolve(reselectPointAsync); return; }

        _onModeChange = reject;   // disallow mode change
        _onStagingChange = () => resolve(updateCloseEditorAsync);

        ui.sidebar.showEntityEditor();

        curtain.reveal({
          revealSelector: '.entity-editor-pane',
          tipHtml: helpHtml(context, 'intro.points.update'),
          tipClass: 'intro-points-describe'
        });
      }))
      .finally(() => {
        _onModeChange = null;
        _onStagingChange = null;
      });
 }


  // "When you are finished updating the cafe..."
  // Close Entity editor / leave select mode to advance
  function updateCloseEditorAsync() {
    if (!_doesPointExist() || !_isPointSelected()) return Promise.resolve(reselectPointAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = () => resolve(rightClickPointAsync);

      ui.sidebar.showEntityEditor();

      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml(context, 'intro.points.update_close', { button: icon('#rapid-icon-close', 'inline') })
      });
    })
    .finally(() => {
      _onModeChange = null;
    });
  }


  // "You can right-click on any feature to see the edit menu..."
  // Open the edit menu to advance
  function rightClickPointAsync() {
    if (!_doesPointExist()) return Promise.resolve(reselectPointAsync);
    if (!['browse', 'select-osm'].includes(context.mode?.id)) context.enter('browse');

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onStagingChange = reject;  // disallow doing anything else

      const textID = context.lastPointerType === 'mouse' ? 'rightclick' : 'edit_menu_touch';
      curtain.reveal({
        revealExtent: buildingExtent,
        tipHtml: helpHtml(context, `intro.points.${textID}`)
      });

      editMenu.on('toggled.intro', open => {
        if (open) resolve(enterDeleteAsync);
      });
    })
    .finally(() => {
      _onStagingChange = null;
      editMenu.on('toggled.intro', null);
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
        _onModeChange = () => {
          if (_doesPointExist()) reject();  // point still exists, try again
        };
        _onStableChange = (difference) => {
          const deleted = difference.deleted();
          if (deleted.length === 1 && deleted[0].id === _pointID) {
            resolve(undoAsync);
          }
        };

        if (!_doesPointExist() || !_isPointSelected()) { resolve(rightClickPointAsync); return; }

        curtain.reveal({
          revealSelector: '.edit-menu',
          revealPadding: 50,
          tipHtml: helpHtml(context, 'intro.points.delete')
        });
      }))
      .finally(() => {
        _onModeChange = null;
        _onStableChange = null;
      });
  }


  // "You can always undo any changes up until you save your edits to OpenStreetMap..."
  // Click undo to advance
  function undoAsync() {
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onStableChange = () => resolve(playAsync);
      curtain.reveal({
        revealSelector: '.top-toolbar button.undo-button',
        tipHtml: helpHtml(context, 'intro.points.undo')
      });
    })
    .finally(() => {
      _onStableChange = null;
    });
  }


  // Free play
  // Click on Areas (or another) chapter to advance
  function playAsync() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.ideditor',
      tipSelector: '.intro-nav-wrap .chapter-area',
      tipHtml: helpHtml(context, 'intro.points.play', { next: l10n.t('intro.areas.title') }),
      buttonText: l10n.t('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
    return Promise.resolve();
  }


  chapter.enter = () => {
    _chapterCancelled = false;
    _rejectStep = null;
    _onModeChange = null;
    _onStableChange = null;
    _onStagingChange = null;

    context.on('modechange', _modeChangeListener);
    editor.on('stablechange', _stableChangeListener);
    editor.on('stagingchange', _stagingChangeListener);

    runAsync(addPointAsync)
      .catch(e => { if (e instanceof Error) console.error(e); })   // eslint-disable-line no-console
      .finally(() => {
        context.off('modechange', _modeChangeListener);
        editor.off('stablechange', _stableChangeListener);
        editor.off('stagingchange', _stagingChangeListener);
      });

    function _modeChangeListener(...args) {
      if (typeof _onModeChange === 'function') _onModeChange(...args);
    }
    function _stableChangeListener(...args) {
      if (typeof _onStableChange === 'function') _onStableChange(...args);
    }
    function _stagingChangeListener(...args) {
      if (typeof _onStagingChange === 'function') _onStagingChange(...args);
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
