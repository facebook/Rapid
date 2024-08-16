import { Color } from 'pixi.js';

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


  function render(selection) {
    let iconFill = 0xffffff;
    const mapillary = context.services.mapillary;

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
      .call(uiIcon(`#${_detection.value}`));

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
