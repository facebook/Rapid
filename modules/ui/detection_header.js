import { uiIcon } from './icon.js';


export function uiDetectionHeader(context) {
  const l10n = context.systems.l10n;
  const presets = context.systems.presets;
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
    const d = $selection.datum();
    if (!d) return;

    let iconName;
    if (d.object_type === 'traffic_sign') {
      iconName = d.value;
    } else {
      const service = context.services[d.service];
      const presetID = service && service.getDetectionPresetID(d.value);
      const preset = presetID && presets.item(presetID);
      iconName = preset?.icon || 'fas-question';
    }

    // Some values we don't have icons for, check first - Rapid#1518
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
