import { select as d3_select } from 'd3-selection';
import { Map as mapLibreMap } from 'maplibre-gl';
import { t } from '../core/localizer';
import { uiCmd } from './cmd';


export function ui3DMap(context) {

  function threeDMap(selection) {
    let wrap = d3_select(null);
    let _isHidden = true;          // start out hidden
    let _map;

    function redraw() {
      if (_isHidden) return;
      updateProjection();
    }


    function updateProjection() {
      let bounds = [
        context.map().extent().min,
        context.map().extent().max
    ];

      _map.fitBounds(this.bounds = )

    }

    function toggle(d3_event) {
      if (d3_event) d3_event.preventDefault();

      _isHidden = !_isHidden;

      context
        .container()
        .select('.three-d-map-toggle-item')
        .classed('active', !_isHidden)
        .select('input')
        .property('checked', !_isHidden);

      if (_isHidden) {
        wrap
          .style('display', 'block')
          .style('opacity', '1')
          .transition()
          .duration(200)
          .style('opacity', '0')
          .on('end', () => selection.selectAll('.three-d-map').style('display', 'none'));
      } else {
        wrap
          .style('display', 'block')
          .style('opacity', '0')
          .transition()
          .duration(200)
          .style('opacity', '1')
          .on('end', ()  => redraw());
      }
    }


    /* setup */
    ui3DMap.toggle = toggle;

    wrap = selection.selectAll('.three-d-map')
      .data([0]);

    let wrapEnter = wrap.enter()
      .append('div')
      .attr('class', 'three-d-map')
      .attr('id', '3d-buildings')
      .style('display', _isHidden ? 'none' : 'block');

    wrap = wrapEnter
      .merge(wrap);

    _map = new mapLibreMap({
        container: '3d-buildings', // container id
        style: 'https://demotiles.maplibre.org/style.json', // style URL
        center: [0, 0], // starting position [lng, lat]
        zoom: 1 // starting zoom
        });

      context.map().on('draw', () => redraw());



    redraw();

    context.keybinding().on([uiCmd('⌘' + t('background.3dmap.key'))], toggle);
  }

  return threeDMap;
}
