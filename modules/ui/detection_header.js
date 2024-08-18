import { uiIcon } from './icon.js';


export function uiDetectionHeader(context) {
  const l10n = context.systems.l10n;
  let _detection;


  function getTitle(d) {
    if (d.object_type === 'traffic_sign') {
      return l10n.t('mapillary_signs.traffic_sign');
    } else {
      const stringID = d.value.replace(/--/g, '.');
      return l10n.t(`mapillary_detections.${stringID}`, { default: l10n.t('inspector.unknown') });
    }
  }

  function addIcon($selection) {
    // Some values we don't have icons for, check first - Rapid#1518
    const iconName = $selection.datum().value;
    const hasIcon = context.container().selectAll(`#rapid-defs #${iconName}`).size();

    $selection
      .call(uiIcon(hasIcon ? `#${iconName}` : '#fas-question'));
  }


  function render(selection) {
    const $header = selection.selectAll('.qa-header')
      .data(_detection ? [_detection] : [], d => d.key);

    $header.exit()
      .remove();

    const $$header = $header.enter()
      .append('div')
      .attr('class', 'qa-header');

    $$header
      .append('div')
      .attr('class', 'qa-header-icon')
      .append('div')
      .attr('class', d => `qaItem ${d.service}`)
      .call(addIcon);

    $$header
      .append('div')
      .attr('class', 'qa-header-label')
      .text(getTitle);
  }


  render.datum = function(val) {
    if (!arguments.length) return _detection;
    _detection = val;
    return render;
  };

  return render;
}
