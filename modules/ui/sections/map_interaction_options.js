import { uiTooltip } from '../tooltip.js';
import { uiSection } from '../section.js';


export function uiSectionMapInteractionOptions(context) {
  const storage = context.systems.storage;
  const l10n = context.systems.l10n;

  const section = uiSection(context, 'map_interaction')
    .label(l10n.t('preferences.map_interaction.title'))
    .disclosureContent(renderDisclosureContent);

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
      .text(l10n.t('preferences.map_interaction.mouse_wheel.title'));

    enter
      .append('ul')
      .attr('class', 'layer-list mouse-wheel-options-list');

    // Update
    container
      .merge(enter)
      .selectAll('.mouse-wheel-options-list')
      .call(drawListItems);
  }


  function drawListItems(selection) {
    let items = selection.selectAll('li')
      .data(MOUSE_WHEEL_OPTIONS);

    // Exit
    items.exit()
      .remove();

    // Enter
    let enter = items.enter()
      .append('li')
      .call(uiTooltip(context)
        .title(d => l10n.t(`preferences.map_interaction.mouse_wheel.${d}.tooltip`))
        .placement('top')
      );

    let label = enter
      .append('label');

    label
      .append('input')
      .attr('type', 'radio')
      .attr('name', 'mouse_wheel')
      .on('change', setWheelOption);

    label
      .append('span')
      .text(d => l10n.t(`preferences.map_interaction.mouse_wheel.${d}.title`));

    // Update
    items.merge(enter)
      .classed('active', isActiveWheelOption)
      .selectAll('input')
      .property('checked', isActiveWheelOption)
      .property('indeterminate', false);
  }


  function isActiveWheelOption(d) {
    const curr = storage.getItem('prefs.mouse_wheel.interaction') || 'auto';
    return curr === d;
  }

  function setWheelOption(d3_event, d) {
    storage.setItem('prefs.mouse_wheel.interaction', d);
    section.reRender();
  }

  return section;
}
