import { t } from '../../core/localizer';
import { prefs } from '../../core/preferences';
import { uiTooltip } from '../tooltip';
import { uiSection } from '../section';


export function uiSectionMapInteractionOptions(context) {
  const section = uiSection('map-interaction', context)
    .label(t.html('preferences.map_interaction.title'))
    .disclosureContent(renderDisclosureContent)
    .expandedByDefault(true);

  const MOUSE_WHEEL_OPTIONS = ['auto', 'zoom', 'pan'];


  function renderDisclosureContent(selection) {
    let container = selection.selectAll('.mouse-wheel-options')
      .data([0]);

    // Enter
    const enter = container.enter()
      .append('div')
      .attr('class', 'mouse-wheel-options');

    enter
      .append('div')
      .attr('class', 'mouse-wheel-title')
      .text(t('preferences.map_interaction.mouse_wheel.title'));

    enter
      .append('ul')
      .attr('class', 'layer-list mouse-wheel-options-list');

    // Update
    container
      .merge(enter)
      .selectAll('.mouse-wheel-options-list')
      .call(drawListItems, MOUSE_WHEEL_OPTIONS, 'radio', 'mouse_wheel', setWheelOption, isActiveWheelOption);
  }


  function drawListItems(selection, data, type, name, onChangeFn, isActiveFn) {
    let items = selection.selectAll('li')
      .data(data);

    // Exit
    items.exit()
      .remove();

    // Enter
    let enter = items.enter()
      .append('li')
      .call(uiTooltip()
        .title(d => t(`preferences.map_interaction.${name}.${d}.tooltip`))
        .placement('top')
      );

    let label = enter
      .append('label');

    label
      .append('input')
      .attr('type', type)
      .attr('name', name)
      .on('change', onChangeFn);

    label
      .append('span')
      .text(d => t(`preferences.map_interaction.${name}.${d}.title`));

    // Update
    items.merge(enter)
      .classed('active', isActiveFn)
      .selectAll('input')
      .property('checked', isActiveFn)
      .property('indeterminate', false);
  }


  function isActiveWheelOption(d) {
    const curr = prefs('prefs.mouse_wheel.interaction') ?? 'auto';
    return curr === d;
  }

  function setWheelOption(d3_event, d) {
    prefs('prefs.mouse_wheel.interaction', d);
    section.reRender();
  }

  return section;
}
