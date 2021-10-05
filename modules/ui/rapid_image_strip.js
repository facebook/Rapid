import { select as d3_select } from 'd3-selection';
import { svgIcon } from '../svg/icon';
let _showImageStrip = true;

export function uiRapidImageStrip(context) {
  const rapidContext = context.rapidContext();
  let _datum;

  function showToggle() {
    _showImageStrip = !_showImageStrip;

    let imageStrip = context.container().select('.rapid-image-strip');

    let body = imageStrip.select('.body');
    body.classed('hide', !_showImageStrip);

    let showHide = imageStrip.select('.showhide');
    showHide.classed('collapsed', !_showImageStrip);

    let button = showHide.select('use');
    button.attr('href', _showImageStrip ? '#iD-icon-close' : '#iD-icon-plus');
  }


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
          .on('mouseenter', (_, d) => {
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

    let imageStripHeader = selection.selectAll('.rapid-image-strip');

    imageStripHeader
      .insert('div', ':first-child')
      .attr('class', 'showhide');

    // Add a Show/hide close button.
     let showHide = imageStripHeader.selectAll('.showhide').data([_showImageStrip]);

    showHide
      .append('div')
      .attr('class', 'showhide')
      .append('button')
      .call(svgIcon(_showImageStrip ? '#iD-icon-close' : '#iD-icon-plus'))
      .on('click', showToggle);


    showHide.exit().remove();
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
