import { uiIcon } from './icon.js';
import { uiDetectionDetails } from './detection_details.js';
import { uiDetectionHeader } from './detection_header.js';


export function uiDetectionInspector(context) {
  const l10n = context.systems.l10n;
  const DetectionDetails = uiDetectionDetails(context);
  const DetectionHeader = uiDetectionHeader(context);

  let _detection;


  function render(selection) {
    const $$header = selection.selectAll('.header')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'header fillL');

    $$header
      .append('button')
      .attr('class', 'close')
      .on('click', () => context.enter('browse'))
      .call(uiIcon('#rapid-icon-close'));

    $$header
      .append('h3')
      .text(l10n.t('mapillary.detection'));


    let $body = selection.selectAll('.body')
      .data([0]);

    $body = $body.enter()
      .append('div')
      .attr('class', 'body')
      .merge($body);

    const $details = $body.selectAll('.qa-editor')
      .data([0]);

    $details.enter()
      .append('div')
      .attr('class', 'modal-section qa-editor')
      .merge($details)
      .call(DetectionHeader.datum(_detection))
      .call(DetectionDetails.datum(_detection));
  }


  render.datum = function(val) {
    if (!arguments.length) return _detection;
    _detection = val;
    return render;
  };

  return render;
}
