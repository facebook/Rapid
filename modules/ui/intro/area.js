import { Extent } from '@id-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { interpolateNumber as d3_interpolateNumber } from 'd3-interpolate';

import { presetManager } from '../../presets';
import { t } from '../../core/localizer';
import { modeSelect } from '../../modes/select';
import { utilRebind } from '../../util/rebind';
import { delayAsync, eventCancel, helpHtml, icon, transitionTime } from './helper';


export function uiIntroArea(context, curtain) {
  const dispatch = d3_dispatch('done');
  const chapter = { title: 'intro.areas.title' };
  const container = context.container();
  const history = context.history();
  const map = context.map();

  const playgroundExtent = new Extent([-85.63575, 41.94137], [-85.63526, 41.94180]);
  const playgroundPreset = presetManager.item('leisure/playground');
  const nameField = presetManager.field('name');
  const descriptionField = presetManager.field('description');

  let _chapterCancelled = false;
  let _rejectStep = null;
  let _areaID = null;


  // Helper function to make sure the area exists
  function _doesAreaExist() {
    return _areaID && context.hasEntity(_areaID);
  }

  // Helper function to make sure the area is selected
  function _isAreaSelected() {
    if (context.mode().id !== 'select') return false;
    const ids = context.selectedIDs();
    return ids.length === 1 && ids[0] === _areaID;
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

  function runAsync(currStep) {
    if (_chapterCancelled) return Promise.reject();
    if (typeof currStep !== 'function') return Promise.resolve();  // guess we're done

    return currStep()
      .then(nextStep => runAsync(nextStep))   // recurse and advance
      .catch(() => runAsync(currStep));       // recurse and retry
  }


  // "Areas are used to show the boundaries of features like lakes, buildings, and residential areas..."
  // Click "Add Area" button to advance
  function addAreaAsync() {
    context.enter('browse');
    history.reset('initial');
    _areaID = null;

    const loc = playgroundExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    return map
      .setCenterZoomAsync(loc, 19.5, msec)
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;
        const tooltip = curtain.reveal({
          revealSelector: 'button.draw-area',
          tipHtml: helpHtml('intro.areas.add_playground')
        });

        tooltip.selectAll('.popover-inner')
          .insert('svg', 'span')
          .attr('class', 'tooltip-illustration')
          .append('use')
          .attr('xlink:href', '#iD-graphic-areas');

        context.on('enter.intro', () => resolve(startPlaygroundAsync));
      }))
      .finally(() => {
        context.on('enter.intro', null);
      });
  }


  // "Let's add this playground to the map by drawing an area..."
  // Click to place the initial point to advance
  function startPlaygroundAsync() {
    if (context.mode().id !== 'draw-area') return Promise.resolve(addAreaAsync);
    _areaID = null;

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      const textID = (context.lastPointerType() === 'mouse') ? 'click' : 'tap';
      const startDrawString = helpHtml('intro.areas.start_playground') +
        helpHtml(`intro.areas.starting_node_${textID}`);

      curtain.reveal({
        revealExtent: playgroundExtent,
        tipHtml: startDrawString
      });

      history.on('change.intro', difference => {
        if (!difference) return;
        for (const entity of difference.created()) {  // created a node and a way
          if (entity.type === 'way') {
            _areaID = entity.id;
            resolve(continuePlaygroundAsync);
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


  // "Continue drawing the area by placing more nodes along the playground's edge..."
  // Add at least 5 nodes to advance
  function continuePlaygroundAsync() {
    if (!_doesAreaExist() || context.mode().id !== 'draw-area') return Promise.resolve(addAreaAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      curtain.reveal({
        revealExtent: playgroundExtent,
        tipHtml: helpHtml('intro.areas.continue_playground')
      });

      history.on('change.intro', difference => {
        if (!difference) return;
        for (const entity of difference.modified()) {  // modified the way
          if (entity.id === _areaID && entity.nodes.length > 5) {
            resolve(finishPlaygroundAsync);
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


  // "Finish the area by pressing return, or clicking again on either the first or last node..."
  // Finish the area to advance
  function finishPlaygroundAsync() {
    if (!_doesAreaExist() || context.mode().id !== 'draw-area') return Promise.resolve(addAreaAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;

      const textID = (context.lastPointerType() === 'mouse') ? 'click' : 'tap';
      const finishString = helpHtml(`intro.areas.finish_area_${textID}`) +
        helpHtml('intro.areas.finish_playground');

      curtain.reveal({
        revealExtent: playgroundExtent,
        tipHtml: finishString
      });

      context.on('enter.intro', () => resolve(searchPresetAsync));
    })
    .finally(() => {
      context.on('enter.intro', null);
    });
  }


  // Search for Playground and select it from the preset search result to advance
  function searchPresetAsync() {
    if (!_doesAreaExist()) return Promise.resolve(addAreaAsync);
    if (!_isAreaSelected()) context.enter(modeSelect(context, [_areaID]));

    return delayAsync()  // after preset pane visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;

        _showPresetList();
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        curtain.reveal({
          revealSelector: '.preset-search-input',
          revealPadding: 5,
          tipHtml: helpHtml('intro.areas.search_playground', { preset: playgroundPreset.name() })
        });

        container.select('.preset-search-input')
          .on('keydown.intro', null)
          .on('keyup.intro', _checkPresetSearch);


        // Get user to choose the Playground preset from the search result
        function _checkPresetSearch() {
          const first = container.select('.preset-list-item:first-child');
          if (!first.classed('preset-leisure-playground')) return;

          curtain.reveal({
            revealNode: first.select('.preset-list-button').node(),
            revealPadding: 5,
            tipHtml: helpHtml('intro.areas.search_playground', { preset: playgroundPreset.name() })
          });

          container.select('.preset-search-input')
            .on('keydown.intro', eventCancel, true)   // no more typing
            .on('keyup.intro', null);
        }

        history.on('change.intro', difference => {
          if (!difference) return;
          const modified = difference.modified();
          if (modified.length === 1) {
            if (presetManager.match(modified[0], context.graph()) === playgroundPreset) {
              resolve(clickAddFieldAsync);
            } else {
              reject();  // didn't pick playground
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


  // "This playground doesn't have an official name, so we won't add anything in the name field..."
  // "Instead let's add some additional details about the playground to the description field..."
  // Expand the Add field combo to advance
  function clickAddFieldAsync() {
    if (!_doesAreaExist()) return Promise.resolve(addAreaAsync);
    if (!_isAreaSelected()) context.enter(modeSelect(context, [_areaID]));

    if (!container.select('.form-field-description').empty()) {  // has description field already
      return Promise.resolve(describePlaygroundAsync);
    }

    return delayAsync()  // after entity editor visible
      .then(() => new Promise((resolve, reject) => {
        _rejectStep = reject;

        _showEntityEditor();
        container.select('.inspector-wrap').on('wheel.intro', eventCancel);   // prevent scrolling

        // It's possible for the user to add a description in a previous step..
        // If they did this already, just complete this chapter
        const entity = context.entity(_areaID);
        if (entity.tags.description) {
          resolve(playAsync);
          return;
        }

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
            tipHtml: helpHtml('intro.areas.add_field', {
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

        context.on('enter.intro', reject);   // disallow mode change
      }))
      .finally(() => {
        context.on('enter.intro', null);
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

      _showEntityEditor();

      curtain.reveal({
        revealSelector: 'div.combobox',
        revealPadding: 5,
        tipHtml: helpHtml('intro.areas.choose_field', { field: descriptionField.label() })
      });

      context.on('enter.intro', reject);   // disallow mode change
    })
    .finally(() => {
      if (watcher) window.clearInterval(watcher);
      context.on('enter.intro', null);
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
      _showEntityEditor();

      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.areas.describe_playground', { button: icon('#iD-icon-close', 'inline') })
      });

      context.on('enter.intro', () => resolve(playAsync));
    })
    .finally(() => {
      context.on('enter.intro', null);
    });
  }


  // "You didn't select the Description field. Let's try again..."
  // Click Ok to advance
  function retryChooseDescriptionAsync() {
    if (!_doesAreaExist()) return Promise.resolve(addAreaAsync);
    if (!_isAreaSelected()) return Promise.resolve(searchPresetAsync);

    return new Promise((resolve, reject) => {
      _rejectStep = reject;
      _showEntityEditor();

      curtain.reveal({
        revealSelector: '.entity-editor-pane',
        tipHtml: helpHtml('intro.areas.retry_add_field', { field: descriptionField.label() }),
        buttonText: t.html('intro.ok'),
        buttonCallback: () => resolve(clickAddFieldAsync)
      });

      context.on('enter.intro', reject);   // disallow mode change
    })
    .finally(() => {
      context.on('enter.intro', null);
    });
  }


  // Free play
  // Click on Lines (or another) chapter to advance
  function playAsync() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.ideditor',
      tipSelector: '.intro-nav-wrap .chapter-line',
      tipHtml: helpHtml('intro.areas.play', { next: t('intro.lines.title') }),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
    return Promise.resolve();
  }


  chapter.enter = () => {
    _chapterCancelled = false;
    _rejectStep = null;

    runAsync(addAreaAsync)
      .catch(() => { /* noop */ });
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
