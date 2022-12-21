import { Extent } from '@id-sdk/math';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { interpolateNumber as d3_interpolateNumber } from 'd3-interpolate';

import { presetManager } from '../../presets';
import { t } from '../../core/localizer';
import { modeSelect } from '../../modes/select';
import { utilRebind } from '../../util/rebind';
import { helpHtml, icon, transitionTime } from './helper';


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

  let _timeouts = [];
  let _areaID;


  function timeout(fn, t) {
    _timeouts.push(window.setTimeout(fn, t));
  }


  function eventCancel(d3_event) {
    d3_event.stopPropagation();
    d3_event.preventDefault();
  }


  // "Areas are used to show the boundaries of features like lakes, buildings, and residential areas..."
  // Click "Add Area" button to advance
  function addArea() {
    context.enter('browse');
    history.reset('initial');
    _areaID = null;

    const loc = playgroundExtent.center();
    const msec = transitionTime(loc, map.center());
    if (msec > 0) curtain.hide();

    map
      .setCenterZoomAsync(loc, 19.5, msec)
      .then(() => {
        const tooltip = curtain.reveal({
          revealSelector: 'button.draw-area',
          tipHtml: helpHtml('intro.areas.add_playground')
        });

        tooltip.selectAll('.popover-inner')
          .insert('svg', 'span')
          .attr('class', 'tooltip-illustration')
          .append('use')
          .attr('xlink:href', '#iD-graphic-areas');
      });

    context.on('enter.intro', mode => {
      if (mode.id !== 'draw-area') return;
      continueTo(startPlayground);
    });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Let's add this playground to the map by drawing an area..."
  // Click to place the initial point to advance
  function startPlayground() {
    if (context.mode().id !== 'draw-area') return chapter.restart();
    _areaID = null;

    function onClick() {
      if (context.mode().id !== 'draw-area') return chapter.restart();
      continueTo(continuePlayground);
    }

    const textID = context.lastPointerType() === 'mouse' ? 'starting_node_click' : 'starting_node_tap';
    const startDrawString = helpHtml('intro.areas.start_playground') + helpHtml(`intro.areas.${textID}`);

    curtain.reveal({
      revealExtent: playgroundExtent,
      tipHTML: startDrawString
    });

    timeout(() => {
      context.behaviors.get('draw').on('click', onClick);
    }, 250);  // after reveal

    function continueTo(nextStep) {
      context.behaviors.get('draw').off('click', onClick);
      nextStep();
    }
  }


  // "Continue drawing the area by placing more nodes along the playground's edge..."
  // Add at least 5 nodes to advance
  function continuePlayground() {
    if (context.mode().id !== 'draw-area') return chapter.restart();

    _areaID = context.selectedIDs()[0];

    curtain.reveal({
      revealExtent: playgroundExtent,
      tipHTML: helpHtml('intro.areas.continue_playground')
    });

    function onClick() {
      const entity = context.hasEntity(_areaID);
      if (entity && entity.nodes.length >= 5) {
        return continueTo(finishPlayground);
      } else {
        return;
      }
    }

    context.behaviors.get('draw').on('click', onClick);

    function continueTo(nextStep) {
      context.behaviors.get('draw').off('click', onClick);
      nextStep();
    }
  }


  // "Finish the area by pressing return, or clicking again on either the first or last node..."
  // Finish the area to advance
  function finishPlayground() {
    if (context.mode().id !== 'draw-area') return chapter.restart();

    const finishString = helpHtml('intro.areas.finish_area_' + (context.lastPointerType() === 'mouse' ? 'click' : 'tap')) +
      helpHtml('intro.areas.finish_playground');

    curtain.reveal({
      revealExtent: playgroundExtent,
      tipHTML: finishString
    });

    function onFinish() {
      continueTo(searchPresets);
    }

    context.behaviors.get('draw').on('finish', onFinish);

    function continueTo(nextStep) {
      context.behaviors.get('draw').off('finish', onFinish);
      nextStep();
    }
  }


  // Search for Playground and select it from the preset search result to advance
  function searchPresets() {
    if (!_areaID || !context.hasEntity(_areaID)) {
      return continueTo(addArea);
    }

    const ids = context.selectedIDs();
    if (context.mode().id !== 'select' || !ids.length || ids[0] !== _areaID) {
      context.enter(modeSelect(context, [_areaID]));
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
        revealPadding: 5,
        tipHtml: helpHtml('intro.areas.search_playground', { preset: playgroundPreset.name() })
      });

    }, 400);  // after preset list pane visible..


    history.on('change.intro', null);

    function checkPresetSearch() {
      const first = container.select('.preset-list-item:first-child');
      if (!first.classed('preset-leisure-playground')) return;

      curtain.reveal({
        revealNode: first.select('.preset-list-button').node(),
        revealPadding: 5,
        tipHtml: helpHtml('intro.areas.search_playground', { preset: playgroundPreset.name() })
      });

      container.select('.preset-search-input')
        .on('keydown.intro', eventCancel, true)
        .on('keyup.intro', null);

      history.on('change.intro', () => continueTo(clickAddField));
    }

    function continueTo(nextStep) {
      container.select('.inspector-wrap').on('wheel.intro', null);
      history.on('change.intro', null);
      container.select('.preset-search-input').on('keydown.intro keyup.intro', null);
      nextStep();
    }
  }


  // "This playground doesn't have an official name, so we won't add anything in the name field..."
  // "Instead let's add some additional details about the playground to the description field..."
  // Expand the Add field combo to advance
  function clickAddField() {
    if (!_areaID || !context.hasEntity(_areaID)) {
      return addArea();
    }
    const ids = context.selectedIDs();
    if (context.mode().id !== 'select' || !ids.length || ids[0] !== _areaID) {
      return searchPresets();
    }

    if (!container.select('.form-field-description').empty()) {
      return continueTo(describePlayground);
    }

    // disallow scrolling
    container.select('.inspector-wrap').on('wheel.intro', eventCancel);

    timeout(() => {
      // reset pane, in case user somehow happened to change it..
      container.select('.inspector-wrap .panewrap').style('right', '0%');

      // It's possible for the user to add a description in a previous step..
      // If they did this already, just continue to next step.
      const entity = context.entity(_areaID);
      if (entity.tags.description) {
        return continueTo(play);
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

      timeout(() => {
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
                continueTo(chooseDescriptionField);
              }
            }, 300);
          });
      }, 300);  // after "Add Field" visible

    }, 400);  // after editor pane visible

    context.on('enter.intro', () => continueTo(searchPresets));

    function continueTo(nextStep) {
      container.select('.inspector-wrap').on('wheel.intro', null);
      container.select('.more-fields .combobox-input').on('click.intro', null);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Choose Description from the list..."
  // Add the Description field to advance
  function chooseDescriptionField() {
    if (!_areaID || !context.hasEntity(_areaID)) {
      return addArea();
    }
    const ids = context.selectedIDs();
    if (context.mode().id !== 'select' || !ids.length || ids[0] !== _areaID) {
      return searchPresets();
    }

    if (!container.select('.form-field-description').empty()) {
      return continueTo(describePlayground);
    }

    // Make sure combobox is ready..
    if (container.select('div.combobox').empty()) {
      return continueTo(clickAddField);
    }

    // Watch for the combobox to go away..
    const watcher = window.setInterval(() => {
      if (container.select('div.combobox').empty()) {
        window.clearInterval(watcher);
        timeout(() => {
          if (container.select('.form-field-description').empty()) {
            continueTo(retryChooseDescription);
          } else {
            continueTo(describePlayground);
          }
        }, 300);  // after description field added.
      }
    }, 300);

    curtain.reveal({
      revealSelector: 'div.combobox',
      revealPadding: 5,
      tipHtml: helpHtml('intro.areas.choose_field', { field: descriptionField.label() })
    });

    context.on('enter.intro', () => continueTo(searchPresets));

    function continueTo(nextStep) {
      if (watcher) window.clearInterval(watcher);
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "Add a description, then press the X button to close the feature editor..."
  // Close entity editor / leave select mode to advance
  function describePlayground() {
    if (!_areaID || !context.hasEntity(_areaID)) {
      return addArea();
    }
    const ids = context.selectedIDs();
    if (context.mode().id !== 'select' || !ids.length || ids[0] !== _areaID) {
      return searchPresets();
    }

    // reset pane, in case user happened to change it..
    container.select('.inspector-wrap .panewrap').style('right', '0%');

    if (container.select('.form-field-description').empty()) {
      return continueTo(retryChooseDescription);
    }

    context.on('enter.intro', () => continueTo(play));

    curtain.reveal({
      revealSelector: '.entity-editor-pane',
      tipHtml: helpHtml('intro.areas.describe_playground', { button: icon('#iD-icon-close', 'inline') })
    });

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // "You didn't select the Description field. Let's try again..."
  // Click Ok to advance
  function retryChooseDescription() {
    if (!_areaID || !context.hasEntity(_areaID)) {
      return addArea();
    }
    const ids = context.selectedIDs();
    if (context.mode().id !== 'select' || !ids.length || ids[0] !== _areaID) {
      return searchPresets();
    }

    // reset pane, in case user happened to change it..
    container.select('.inspector-wrap .panewrap').style('right', '0%');

    curtain.reveal({
      revealSelector: '.entity-editor-pane',
      tipHtml: helpHtml('intro.areas.retry_add_field', { field: descriptionField.label() }),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => continueTo(clickAddField)
    });

    context.on('enter.intro', () => continueTo(searchPresets));

    function continueTo(nextStep) {
      context.on('enter.intro', null);
      nextStep();
    }
  }


  // Free play
  // Click on Lines (or another) chapter to advance
  function play() {
    dispatch.call('done');
    curtain.reveal({
      revealSelector: '.ideditor',
      tipSelector: '.intro-nav-wrap .chapter-line',
      tipHtml: helpHtml('intro.areas.play', { next: t('intro.lines.title') }),
      buttonText: t.html('intro.ok'),
      buttonCallback: () => curtain.reveal({ revealSelector: '.ideditor' })  // re-reveal but without the tooltip
    });
  }


  chapter.enter = () => {
    addArea();
  };


  chapter.exit = () => {
    _timeouts.forEach(window.clearTimeout);
    context.on('enter.intro', null);
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
