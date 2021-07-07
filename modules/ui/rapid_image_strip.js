import { select as d3_select } from 'd3-selection';
import { t } from '../core/localizer';

import { svgIcon } from '../svg';
import { uiTooltip } from './tooltip';


export function uiRapidImageStrip(context) {
  const rapidContext = context.rapidContext();
  let _datum;

  function rapidImageStrip(selection) {
    let imageStrip = selection.selectAll('.rapid-image-strip')
      .data([0]);

    let imageStripEnter = imageStrip
      .enter()
      .append('div')
      .attr('class', 'rapid-image-strip');

    imageStrip = imageStrip
      .merge(imageStripEnter);

    // Body
    let body = imageStrip.selectAll('.body')
      .data([0]);

    let bodyEnter = body
      .enter()
      .append('div')
      .attr('class', 'body');

    body = body
      .merge(bodyEnter);

    if(_datum.suggestionContext && _datum.suggestionContext.streetViewImageSet) {
      const {images} = _datum.suggestionContext.streetViewImageSet;
      if(images) {
        const img = body.selectAll('.rapid-image-strip .images')
          .data([0]);
        const imagesEnter = img
          .enter()

        imagesEnter.selectAll('.rapid-image-strip .image')
          .data(images.sort(sortByLon))  //TODO: remove this sort once the backend serves stuff up in the appropriate order
          .enter()
          .append('div')
          .on('mouseenter', d => {
            const rapidContext = context.rapidContext();
            rapidContext.selectSuggestedViewfield(d);
          })
          .on('mouseleave', () => {
            const rapidContext = context.rapidContext();
            rapidContext.selectSuggestedViewfield(null);
          })
          .each(showImage);

        context.rapidContext().on('select_suggested_image', function() {
          const selectedImage = rapidContext.getSelectSuggestedImage();
          if(selectedImage) {
            body.select(`.rapid-image-strip-${selectedImage.key}`)
              .classed('rapid-image-strip-highlight', true);
          } else {
            body.selectAll(`.rapid-image-strip`)
              .classed('rapid-image-strip-highlight', false);
          }
        });
      }
    }
  }


  function sortByLon(img1, img2) {
    if (img1.lon > img2.lon) return 1;
    if (img1.lon < img2.lon) return -1;
    return 0;
  }


  function showImage(d, i, nodes) {
    const selection = d3_select(nodes[i]);
    selection.append('img').attr('src', d.url)
      .attr('class', `rapid-image-strip image rapid-image-strip-${d.key}`);

  }


  rapidImageStrip.datum = function(val) {
    if (!arguments.length) return _datum;
    _datum = val;
    return this;
  };

  return rapidImageStrip;
}
