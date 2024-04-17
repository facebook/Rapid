import { Extent } from '@rapid-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { interpolateNumber as d3_interpolateNumber } from 'd3-interpolate';

import { utilRebind } from '../../util/rebind.js';
import { delayAsync, eventCancel, helpHtml, icon, transitionTime } from './helper.js';


export function uiIntroArea(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.areas.title' };
  const container = context.container();
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const presets = context.systems.presets;
  const ui = context.systems.ui;

  const playgroundExtent = new Extent([-85.63575, 41.94137], [-85.63526, 41.94180]);
  const playgroundPreset = presets.item('leisure/playground');
  const nameField = presets.field('name');
  const descriptionField = presets.field('description');

  let _chapterCancelled = false;
  let _rejectStep = null;
  let _onModeChange = null;
  let _onStagingChange = null;
  let _areaID = null;


  // Helper functions
  function _doesAreaExist() {
    const graph = editor.staging.graph;
    return _areaID && graph.hasEntity(_areaID);
  }

  function _isAreaSelected() {
    if (context.mode?.id !== 'select-osm') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === _areaID;
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


  // "Areas are used to show the boundaries of features like lakes, buildings, and residential areas..."
  // Click "Add Area" button to advance
  function addAreaAsync() {
    context.enter('browse');
    editor.restoreCheckpoint('initial');
    _areaID = null;

    const loc = playgroundExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setMapParamsAsync(loc, 19.5, 0, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        _onModeChange = () => resolve(startPlaygroundAsync);

        const tooltip = curtain.reveal({
          revealSelector: 'button.draw-area',
          tipHtml: helpHtml(context, 'intro.areas.add_playground')
        });

        tooltip.selectAll('.popover-inner')
          .insert('svg', 'span')
          .attr('class', 'tooltip-illustration')
          .append('use')
          .attr('xlink:href', '#rapid-graphic-areas');
      }))
      .finally(() => {
        _onModeChange = null;
      });
  }


  // "Let's add this playground to the map by drawing an area..."
  // Click to place the initial point to advance
  function startPlaygroundAsync() {
    if (context.mode?.id !== 'draw-area') return Promise.resolve(addAreaAsync);
    _areaID = null;

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = reject;  // disallow mode change
      _onStagingChange = (difference) => {
        for (const entity of difference.created()) {  // created a node and a way
          if (entity.type === 'way') {
            _areaID = entity.id;
            resolve(continuePlaygroundAsync);
          }
        }
      };

      const textID = (context.lastPointerType === 'mouse') ? 'click' : 'tap';
      const startDrawString = helpHtml(context, 'intro.areas.start_playground') +
        helpHtml(context, `intro.areas.starting_node_${textID}`);

      curtain.reveal({
        revealExtent: playgroundExtent,
        tipHtml: startDrawString
      });
    })
    .finally(() => {
      _onModeChange = null;
      _onStagingChange = null;
    });
  }


  // "Continue drawing the area by placing more nodes along the playground's edge..."
  // Add at least 5 nodes to advance
  function continuePlaygroundAsync() {
    if (!_doesAreaExist() || context.mode?.id !== 'draw-area') return Promise.resolve(addAreaAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = reject;  // disallow mode change
      _onStagingChange = (difference) => {
        for (const entity of difference.modified()) {  // modified the way
          if (entity.id === _areaID && entity.nodes.length > 5) {
            resolve(finishPlaygroundAsync);
          }
        }
      };

      curtain.reveal({
        revealExtent: playgroundExtent,
        tipHtml: helpHtml(context, 'intro.areas.continue_playground')
      });
    })
    .finally(() => {
      _onModeChange = null;
      _onStagingChange = null;
    });
  }


  // "Finish the area by pressing return, or clicking again on either the first or last node..."
  // Finish the area to advance
  function finishPlaygroundAsync() {
    if (!_doesAreaExist() || context.mode?.id !== 'draw-area') return Promise.resolve(addAreaAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = () => resolve(searchPresetAsync);

      const textID = (context.lastPointerType === 'mouse') ? 'click' : 'tap';
      const finishString = helpHtml(context, `intro.areas.finish_area_${textID}`) +
        helpHtml(context, 'intro.areas.finish_playground');

      curtain.reveal({
        revealExtent: playgroundExtent,
        tipHtml: finishString
      });
    })
    .finally(() => {
      _onModeChange = null;
    });
  }


  // Search for Playground and select it from the preset search result to advance
  function searchPresetAsync() {
    return delayAsync()  // after preset pane visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesAreaExist()) { resolve(addAreaAsync); return; }
        if (!_isAreaSelected()) context.enter('select-osm', { selection: { osm: [_areaID] }} );

        _onModeChange = reject;   // disallow mode change;
        _onStagingChange = (difference) => {
          const modified = difference.modified();
          if (modified.length === 1) {
            const graph = editor.staging.graph;
            if (presets.match(modified[0], graph) === playgroundPreset) {
              resolve(clickAddFieldAsync);
            } else {
              reject();  // didn't pick playground
            }
          }
        };

        ui.sidebar.showPresetList();
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        curtain.reveal({
          revealSelector: '.preset-search-input',
          tipHtml: helpHtml(context, 'intro.areas.search_playground', { preset: playgroundPreset.name() })
        });

        container.select('.preset-search-input')
          .on('keydown.intro', null)
          .on('keyup.intro', _checkPresetSearch);


        // Get user to choose the Playground preset from the search result
        function _checkPresetSearch() {
          const first = container.select('.preset-list-item:first-child');
          if (!first.classed('preset-leisure_playground')) return;

          curtain.reveal({
            revealNode: first.select('.preset-list-button').node(),
            revealPadding: 5,
            tipHtml: helpHtml(context, 'intro.areas.search_playground', { preset: playgroundPreset.name() })
          });

          container.select('.preset-search-input')
            .on('keydown.intro', eventCancel, true)   // no more typing
            .on('keyup.intro', null);
        }
      }))
      .finally(() => {
        _onModeChange = null;
        _onStagingChange = null;
        container.select('.inspector-wrap').on('wheel.intro', null);
        container.select('.preset-search-input').on('keydown.intro keyup.intro', null);
      });
  }


  // "This playground doesn't have an official name, so we won't add anything in the name field..."
  // "Instead let's add some additional details about the playground to the description field..."
  // Expand the Add field combo to advance
  function clickAddFieldAsync() {
    return delayAsync()  // after entity editor visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        if (!_doesAreaExist()) { resolve(addAreaAsync); return; }
        if (!_isAreaSelected()) context.enter('select-osm', { selection: { osm: [_areaID] }} );

        if (!container.select('.form-field-description').empty()) {  // has description field already
          resolve(describePlaygroundAsync);
          return;
        }

        // It's possible for the user to add a description in a previous step..
        // If they did this already, just complete this chapter
        const graph = editor.staging.graph;
        const entity = graph.entity(_areaID);
        if (entity.tags.description) {
          resolve(playAsync);
          return;
        }

        _onModeChange = reject;   // disallow mode change;

        ui.sidebar.showEntityEditor();
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        // scroll "Add field" into view
        const box = container.select('.more-fields').node().getBoundingClientRect();
        if (box.top > 300) {
          const pane = container.select('.entity-editor-pane .inspector-body');
          const start = pane.node().scrollTop;
          const end = start + (box.top - 300);

          pane
            .transition()
            .duration(250)
            .tween('scroll.inspector', () => {
              const node = this;
              const lerp = d3_interpolateNumber(start, end);
              return function(t) {
                node.scrollTop = lerp(t);
              };
            });
        }

        window.setTimeout(() => {
          curtain.reveal({
            revealSelector: '.more-fields .combobox-input',
            revealPadding: 5,
            tipHtml: helpHtml(context, 'intro.areas.add_field', {
              name: nameField.label(),
              description: descriptionField.label()
            })
          });

          container.select('.more-fields .combobox-input')
            .on('click.intro', () => {
              // Watch for the combobox to appear...
              const watcher = window.setInterval(() => {
                if (!container.select('div.combobox').empty()) {
                  window.clearInterval(watcher);
                  resolve(chooseDescriptionFieldAsync);
                }
              }, 300);
            });
        }, 300);  // after "Add Field" visible

      }))
      .finally(() => {
        _onModeChange = null;
        container.select('.inspector-wrap').on('wheel.intro', null);
        container.select('.more-fields .combobox-input').on('click.intro', null);
      });
  }


  // "Choose Description from the list..."
  // Add the Description field to advance
  function chooseDescriptionFieldAsync() {
    if (!_doesAreaExist()) return Promise.resolve(addAreaAsync);
    if (!_isAreaSelected()) return Promise.resolve(searchPresetAsync);

    if (!container.select('.form-field-description').empty()) {  // has description field already
      return Promise.resolve(describePlaygroundAsync);
    }

    // Make sure combobox is open..
    if (container.select('div.combobox').empty()) {
      return Promise.resolve(clickAddFieldAsync);
    }

    let watcher;
    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = reject;   // disallow mode change;

      // Watch for the combobox to close..
      watcher = window.setInterval(() => {
        if (container.select('div.combobox').empty()) {
          window.clearInterval(watcher);
          window.setTimeout(() => {
            if (container.select('.form-field-description').empty()) {
              resolve(retryChooseDescriptionAsync);
            } else {
              resolve(describePlaygroundAsync);
            }
          }, 300);  // after description field added.
        }
      }, 300);

      ui.sidebar.showEntityEditor();

      curtain.reveal({
        revealSelector: 'div.combobox',
        revealPadding: 5,
        tipHtml: helpHtml(context, 'intro.areas.choose_field', { field: descriptionField.label() })
      });

    })
    .finally(() => {
      _onModeChange = null;
      if (watcher) window.clearInterval(watcher);
    });
  }


  // "Add a description, then press the X button to close the feature editor..."
  // Close entity editor / leave select mode to advance
  function describePlaygroundAsync() {
    if (!_doesAreaExist()) return Promise.resolve(addAreaAsync);
    if (!_isAreaSelected()) return Promise.resolve(searchPresetAsync);

    if (container.select('.form-field-description').empty()) {  // no description field
      return Promise.resolve(retryChooseDescriptionAsync);
    }

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = () => resolve(playAsync);

      ui.sidebar.showEntityEditor();

      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml(context, 'intro.areas.describe_playground', { button: icon('#rapid-icon-close', 'inline') })
      });
    })
    .finally(() => {
      _onModeChange = null;
    });
  }


  // "You didn't select the Description field. Let's try again..."
  // Click Ok to advance
  function retryChooseDescriptionAsync() {
    if (!_doesAreaExist()) return Promise.resolve(addAreaAsync);
    if (!_isAreaSelected()) return Promise.resolve(searchPresetAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _onModeChange = reject;   // disallow mode change;
      ui.sidebar.showEntityEditor();

      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml(context, 'intro.areas.retry_add_field', { field: descriptionField.label() }),
        buttonText: l10n.t('intro.ok'),
        buttonCallback: () => resolve(clickAddFieldAsync)
      });
    })
    .finally(() => {
      _onModeChange = null;
    });
  }


  // Free play
  // Click on Lines (or another) chapter to advance
  function playAsync() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.ideditor',
      tipSelector: '.intro-nav-wrap .chapter-line',
      tipHtml: helpHtml(context, 'intro.areas.play', { next: l10n.t('intro.lines.title') }),
      buttonText: l10n.t('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
    return Promise.resolve();
  }


  chapter.enter = () => {
    _chapterCancelled = false;
    _rejectStep = null;
    _onModeChange = null;
    _onStagingChange = null;

    context.on('modechange', _modeChangeListener);
    editor.on('stagingchange', _stagingChangeListener);

    runAsync(addAreaAsync)
      .catch(e => { if (e instanceof Error) console.error(e); })   // eslint-disable-line no-console
      .finally(() => {
        context.off('modechange', _modeChangeListener);
        editor.off('stagingchange', _stagingChangeListener);
      });

    function _modeChangeListener(...args) {
      if (typeof _onModeChange === 'function') _onModeChange(...args);
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
