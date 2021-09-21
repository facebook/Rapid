import { select as d3_select } from 'd3-selection';

export function uiRapidImageStrip(context) {
  const rapidContext = context.rapidContext();
  let _datum;

  function rapidImageStrip(selection) {
    let imageStrip = selection.selectAll('.rapid-image-strip')
      .data([0])
      .style('display', 'block');

    context.container().selectAll('.layer-rapid-dataset .suggestionViewfieldGroup')
      .style('display', 'inline');

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

    if (_datum.suggestionContext && _datum.suggestionContext.streetViewImageSet) {
      const {images} = _datum.suggestionContext.streetViewImageSet;
      if (images) {

        images.sort(sortByLon);

        let imagesSelection = body.selectAll('.image-container')
          .data(images, d => d.key)
          .order();

        imagesSelection.exit().remove();

        let imagesSelectionEnter = imagesSelection.enter();

        imagesSelectionEnter
          .append('div').attr('class', 'image-container')
          .append('img').attr('src', d => d.url)
          .attr('class', d => `image rapid-image-strip-${d.key}`)
          .on('mouseenter', d => {
            const rapidContext = context.rapidContext();
            rapidContext.selectSuggestedViewfield(d);
          })
          .on('mousedown', (d3_event, _) => {
            d3_select(d3_event.currentTarget).classed('rapid-image-strip-clicked', true);
          })
          .on('mouseleave', (d3_event, _) => {
            const rapidContext = context.rapidContext();
            rapidContext.selectSuggestedViewfield(null);
            d3_select(d3_event.currentTarget).classed('rapid-image-strip-clicked', false);
          });

          imagesSelection = imagesSelection.merge(imagesSelectionEnter);

        context.rapidContext().on('select_suggested_image', function() {
          const selectedImage = rapidContext.getSelectSuggestedImage();
          if (selectedImage) {
            body.selectAll(`.rapid-image-strip-${selectedImage.key}`)
              .classed('rapid-image-strip-highlight', true);
          } else {
            body.selectAll('img')
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


  rapidImageStrip.datum = function(val) {
    if (!arguments.length) return _datum;
    _datum = val;
    return this;
  };

  return rapidImageStrip;
}
