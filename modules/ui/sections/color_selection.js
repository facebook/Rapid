import { uiTooltip } from '../tooltip';
import { uiIcon } from '../icon';
import { uiSection } from '../section';


export function uiSectionColorSelection(context) {
  const l10n = context.systems.l10n;

  const section = uiSection(context, 'preferences-color-selection')
    .label(l10n.tHtml('preferences.color_selection.title'))
    .disclosureContent(renderDisclosureContent);

  let _checkboxState = false;

  function renderDisclosureContent(selection) {
    // enter
    // You could give this selection statement ANY class name, just make sure it agrees with the
    // .attr call below
    let colorOptionsListEnter = selection.selectAll('.preferences-color-selection-list')
      .data([0])
      .enter()
      .append('ul')
      .attr('class', 'layer-list preferences-color-selection-list');

    let thirdPartyIconsEnter = colorOptionsListEnter
      .append('li')
      .attr('class', 'preferences-color-selection-item')
      .append('label')
      .call(uiTooltip(context)
        .title(l10n.tHtml('preferences.color_selection.tooltip'))
        .placement('bottom')
      );

    thirdPartyIconsEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', d3_event => {
        d3_event.preventDefault();
        console.log('toggled the checkbox in color selection!');
      });

    // Render the individual (single) item.
    thirdPartyIconsEnter
      .append('span')
      .html(l10n.tHtml('preferences.color_selection.description'));

    update();


    function update() {
      selection.selectAll('.preferences-color-item')
        .classed('active', (_checkboxState === 'true'))
        .select('input')
        .property('checked', (_checkboxState === 'true'));
    }
  }

  return section;
}