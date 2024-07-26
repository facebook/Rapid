import { numClamp } from '@rapid-sdk/math';

import { uiIcon } from '../icon.js';
import { uiSection } from '../section.js';


export function uiSectionBackgroundDisplayOptions(context) {
  const imagery = context.systems.imagery;
  const l10n = context.systems.l10n;
  const storage = context.systems.storage;

  const section = uiSection(context, 'background-display-options')
    .label(l10n.t('background.display_options'))
    .disclosureContent(renderDisclosureContent);

  let _storedOpacity = storage.getItem('background-opacity');
  const MINVAL = 0;
  const MAXVAL = 3;
  const settings = ['brightness', 'contrast', 'saturation', 'sharpness'];

  let _options = {
    brightness: (_storedOpacity !== null ? (+_storedOpacity) : 1),
    contrast: 1,
    saturation: 1,
    sharpness: 1
  };



  function updateValue(d, val) {
    val = numClamp(val, MINVAL, MAXVAL);

    _options[d] = val;
    if (d === 'brightness') {
      storage.setItem('background-opacity', val);
      imagery.brightness = val;
    } else if (d === 'contrast') {
      imagery.contrast = val;
    } else if (d === 'saturation') {
      imagery.saturation = val;
    } else if (d === 'sharpness') {
      imagery.sharpness = val;
    }
    section.reRender();
  }


  function renderDisclosureContent(selection) {
    let container = selection.selectAll('.display-options-container')
      .data([0]);

    let containerEnter = container.enter()
      .append('div')
      .attr('class', 'display-options-container controls-list');

    // add slider controls
    let slidersEnter = containerEnter.selectAll('.display-control')
      .data(settings)
      .enter()
      .append('div')
      .attr('class', d => `display-control display-control-${d}`);

    slidersEnter
      .append('h5')
      .text(d => l10n.t(`background.${d}`))
      .append('span')
      .attr('class', d => `display-option-value display-option-value-${d}`);

    let sildersControlEnter = slidersEnter
      .append('div')
      .attr('class', 'control-wrap');

    sildersControlEnter
      .append('input')
      .attr('class', d => `display-option-input display-option-input-${d}`)
      .attr('type', 'range')
      .attr('min', MINVAL)
      .attr('max', MAXVAL)
      .attr('step', '0.05')
      .on('input', (d3_event, d) => {
        updateValue(d, (d3_event.target.value || 1));
      });

    sildersControlEnter
      .append('button')
      .attr('title', l10n.t('background.reset'))
      .attr('class', d => `display-option-reset display-option-reset-${d}`)
      .on('click', (d3_event, d) => {
        if (d3_event.button !== 0) return;  // left click only
        updateValue(d, 1);
      })
      .call(uiIcon('#rapid-icon-' + (l10n.isRTL() ? 'redo' : 'undo')));

    // reset all button
    containerEnter
      .append('a')
      .attr('class', 'display-option-resetlink')
      .attr('href', '#')
      .text(l10n.t('background.reset_all'))
      .on('click', d3_event => {
        d3_event.preventDefault();
        for (const s of settings) {
          updateValue(s, 1);
        }
      });

    // update
    container = containerEnter
      .merge(container);

    container.selectAll('.display-option-input')
      .property('value', d => _options[d]);

    container.selectAll('.display-option-value')
      .text(d => Math.floor(_options[d] * 100) + '%');

    container.selectAll('.display-option-reset')
      .classed('disabled', d => _options[d] === 1);

    // first time only, set brightness if needed
    if (containerEnter.size() && _options.brightness !== 1) {
      imagery.brightness = _options.brightness;
    }
  }

  return section;
}
