import { uiTooltip } from '../tooltip';
import { uiIcon } from '../icon';
import { uiSection } from '../section';


export function uiSectionPrivacy(context) {
  const l10n = context.systems.l10n;
  const storage = context.systems.storage;

  const section = uiSection(context, 'preferences-third-party')
    .label(l10n.tHtml('preferences.privacy.title'))
    .disclosureContent(renderDisclosureContent);

  let _showThirdPartyIcons = storage.getItem('preferences.privacy.thirdpartyicons') || 'true';

  function renderDisclosureContent(selection) {
    // enter
    let privacyOptionsListEnter = selection.selectAll('.privacy-options-list')
      .data([0])
      .enter()
      .append('ul')
      .attr('class', 'layer-list privacy-options-list');

    let thirdPartyIconsEnter = privacyOptionsListEnter
      .append('li')
      .attr('class', 'privacy-third-party-icons-item')
      .append('label')
      .call(uiTooltip(context)
        .title(l10n.tHtml('preferences.privacy.third_party_icons.tooltip'))
        .placement('bottom')
      );

    thirdPartyIconsEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', d3_event => {
        d3_event.preventDefault();
        _showThirdPartyIcons = (_showThirdPartyIcons === 'true') ? 'false' : 'true';
        storage.setItem('preferences.privacy.thirdpartyicons', _showThirdPartyIcons);
        update();
      });

    thirdPartyIconsEnter
      .append('span')
      .html(l10n.tHtml('preferences.privacy.third_party_icons.description'));


    // Privacy Policy link
    selection.selectAll('.privacy-link')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'privacy-link')
      .append('a')
      .attr('target', '_blank')
      .call(uiIcon('#rapid-icon-out-link', 'inline'))
      .attr('href', 'https://mapwith.ai/doc/license/MapWithAIPrivacyPolicy.pdf')
      .append('span')
      .html(l10n.tHtml('preferences.privacy.privacy_link'));

    update();


    function update() {
      selection.selectAll('.privacy-third-party-icons-item')
        .classed('active', (_showThirdPartyIcons === 'true'))
        .select('input')
        .property('checked', (_showThirdPartyIcons === 'true'));
    }
  }

  return section;
}
