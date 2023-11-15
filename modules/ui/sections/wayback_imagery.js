import { uiTooltip } from '../tooltip';
import { uiIcon } from '../icon';
import { uiSection } from '../section';


export function uiSectionWaybackImagery(context) {
  const l10n = context.systems.l10n;

  const section = uiSection(context, 'preferences-third-party')
    .label(l10n.tHtml('background.wayback_imagery.title'))
    .disclosureContent(renderDisclosureContent);

  let _checkboxState = false;

  function renderDisclosureContent(selection) {
    // enter
    // You could give this selection statement ANY class name, just make sure it agrees with the
    // .attr call below
    let privacyOptionsListEnter = selection.selectAll('.background-wayback-list')
      .data([0])
      .enter()
      .append('ul')
      .attr('class', 'layer-list background-wayback-list');

    let thirdPartyIconsEnter = privacyOptionsListEnter
      .append('li')
      .attr('class', 'background-wayback-item')
      .append('label')
      .call(uiTooltip(context)
        .title(l10n.tHtml('background.wayback_imagery.tooltip'))
        .placement('bottom')
      );

    thirdPartyIconsEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', d3_event => {
        d3_event.preventDefault();
        console.log('toggled the checkbox in wayback imagery!');
      });

    // Render the individual (single) item.
    thirdPartyIconsEnter
      .append('span')
      .html(l10n.tHtml('background.wayback_imagery.example_item_text'));

    update();


    function update() {
      selection.selectAll('.background-wayback-item')
        .classed('active', (_checkboxState === 'true'))
        .select('input')
        .property('checked', (_checkboxState === 'true'));
    }
  }

  return section;
}
