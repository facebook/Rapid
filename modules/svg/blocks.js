import { geoScaleToZoom } from '@id-sdk/math';
import { locationManager } from '../core/locations';
import { svgPath } from './helpers';


//
// This module creates a layer which can be used to block editing around arbitrary shapes
//
export function svgBlocks(projection, context) {
  const MINZOOM = 4;


  function render(selection) {
    const getPath = svgPath(projection).geojson;
    const zoom = geoScaleToZoom(projection.scale());

    // Gather the blocked regions
    const blocks = locationManager.blocks();

    // Which blocked regions are visible (have a svg path)
    let visibleBlocks = [];
    if (zoom > MINZOOM) {
      blocks.forEach(block => {
        const geojson = locationManager.feature(block.locationSetID);
        const path = getPath(geojson);
        if (path) {
          visibleBlocks.push({
            id: block.locationSetID,
            text: block.text,
            url: block.url,
            path: path
          });
        }
      });
    }

    //
    // setup the layer
    //
    let layer = selection.selectAll('.layer-blocks')
      .data(visibleBlocks.length ? [0] : []);

    layer.exit()
      .remove();

    layer = layer.enter()
      .append('g')
      .attr('class', 'layer-blocks')
      .merge(layer);


    let block = layer
      .selectAll('.blocked')
      .data(visibleBlocks, d => d.id);

    block.exit()
      .remove();

    block.enter()
      .append('path')
      .attr('class', 'blocked nope')
      .style('fill', 'url("#ideditor-pattern-blocked")');

    // update
    layer.selectAll('path')
      .attr('d', d => d.path);


    //
    // setup the explanation
    // add a special 'api-status' line to the map footer explain the block
    //
    let explanationRow = context.container().select('.main-content > .map-footer')
      .selectAll('.api-status.blocks')
      .data(visibleBlocks, d => d.id);

    explanationRow.exit()
      .remove();

    let explanationRowEnter = explanationRow.enter()
      .insert('div', '.api-status')   // before any existing
      .attr('class', 'api-status blocks error');

    explanationRowEnter
      .append('span')
      .attr('class', 'explanation-item')
      .text(d => d.text);

    explanationRowEnter
      .append('a')
      .attr('target', '_blank')
      .attr('href', d => d.url)
      .text('More Info');
  }


  // This looks strange because `enabled` methods on other layers are
  // chainable getter/setters, and this one is just a getter.
  render.enabled = function() {
    if (!arguments.length) {
      return true;
    } else {
      return this;
    }
  };


  return render;
}
