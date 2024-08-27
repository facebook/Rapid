import { uiIcon } from './icon.js';
import { uiDetectionDetails } from './detection_details.js';
import { uiDetectionHeader } from './detection_header.js';
import { UiViewOn } from './UiViewOn.js';


export function uiDetectionInspector(context) {
  const l10n = context.systems.l10n;
  const photos = context.systems.photos;

  const DetectionDetails = uiDetectionDetails(context);
  const DetectionHeader = uiDetectionHeader(context);
  const ViewOn = new UiViewOn(context);

  let _detection;


  function render(selection) {
    // add .header
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


    // add .body
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


    // add .sidebar-footer
    const service = context.services[_detection.service];
    const imageID = _detection.bestImageID || photos.currPhotoID;

    if (service && imageID) {
      ViewOn.stringID = 'mapillary.view_on_mapillary';
      ViewOn.url = service.imageURL(imageID);
    } else {
      ViewOn.stringID = '';
      ViewOn.url = '';
    }

    const $footer = selection.selectAll('.sidebar-footer')
      .data([0]);

    $footer.enter()
      .append('div')
      .attr('class', 'sidebar-footer')
      .merge($footer)
      .call(ViewOn.render);
  }


  render.datum = function(val) {
    if (!arguments.length) return _detection;
    _detection = val;
    return render;
  };

  return render;
}
