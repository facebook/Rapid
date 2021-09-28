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
          .on('mouseenter', (d3_event, d) => {
            const rapidContext = context.rapidContext();
            rapidContext.hoveredSuggestedImage(d);
          })
          .on('mousedown', (d3_event, d) => {
            context.map().centerEase(d.loc);
            d3_select(d3_event.currentTarget).classed('rapid-image-strip-clicked', true);
            rapidContext.hoveredSuggestedImage(d);  //We still want the viewfield to remain highlighted after panning.
          })
          .on('mouseleave', (d3_event) => {
            const rapidContext = context.rapidContext();
            rapidContext.hoveredSuggestedImage(null);
            d3_select(d3_event.currentTarget).classed('rapid-image-strip-clicked', false);
          });

          imagesSelection = imagesSelection.merge(imagesSelectionEnter);

        context.rapidContext().on('hover_suggested_viewfield', function() {
          const hoveredViewfield = rapidContext.getHoveredSuggestedViewfield();
          if (hoveredViewfield) {
            body.selectAll(`.rapid-image-strip-${hoveredViewfield.key}`)
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
