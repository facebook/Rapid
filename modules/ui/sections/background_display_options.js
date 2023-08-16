import { uiIcon } from '../icon';
import { uiSection } from '../section';


export function uiSectionBackgroundDisplayOptions(context) {
  const l10n = context.systems.l10n;
  const storageSystem = context.systems.storage;
  const imagerySystem = context.systems.imagery;

  const section = uiSection('background-display-options', context)
    .label(l10n.tHtml('background.display_options'))
    .disclosureContent(renderDisclosureContent);

  let _storedOpacity = storageSystem.getItem('background-opacity');
  const MINVAL = 0;
  const MAXVAL = 3;
  const settings = ['brightness', 'contrast', 'saturation', 'sharpness'];

  let _options = {
    brightness: (_storedOpacity !== null ? (+_storedOpacity) : 1),
    contrast: 1,
    saturation: 1,
    sharpness: 1
  };

  function clamp(x, min, max) {
    return Math.max(min, Math.min(x, max));
  }


  function updateValue(d, val) {
    val = clamp(val, MINVAL, MAXVAL);

    _options[d] = val;
    if (d === 'brightness') {
      storageSystem.setItem('background-opacity', val);
      imagerySystem.brightness = val;
    } else if (d === 'contrast') {
      imagerySystem.contrast = val;
    } else if (d === 'saturation') {
      imagerySystem.saturation = val;
    } else if (d === 'sharpness') {
      imagerySystem.sharpness = val;
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
      .html(d => l10n.tHtml(`background.${d}`))
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
      .html(l10n.tHtml('background.reset_all'))
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
      imagerySystem.brightness = _options.brightness;
    }
  }

  return section;
}
