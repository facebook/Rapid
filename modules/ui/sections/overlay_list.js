import _debounce from 'lodash-es/debounce';
import { descending as d3_descending, ascending as d3_ascending } from 'd3-array';
import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { uiTooltip } from '../tooltip';
import { uiSection } from '../section';


export function uiSectionOverlayList(context) {
  const section = uiSection('overlay-list', context)
    .label(t.html('background.overlays'))
    .disclosureContent(renderDisclosureContent);

  let _overlayList = d3_select(null);

  function setTooltips(selection) {
    selection.each((d, i, nodes) => {
      const item = d3_select(nodes[i]).select('label');
      const span = item.select('span');
      const placement = (i < nodes.length / 2) ? 'bottom' : 'top';
      const isOverflowing = (span.property('clientWidth') !== span.property('scrollWidth'));

      item.call(uiTooltip().destroyAny);

      if (d.description || isOverflowing) {
        item.call(uiTooltip()
          .placement(placement)
          .title(d.description || d.name)
        );
      }
    });
  }


  function updateLayerSelections(selection) {
    function isActive(d) {
      return context.imagery().showsLayer(d);
    }

    selection.selectAll('li')
      .classed('active', isActive)
      .call(setTooltips)
      .selectAll('input')
      .property('checked', isActive);
  }


  function drawListItems(layerList, type, change, filter) {
    let sources = context.imagery()
      .sources(context.map().extent(), context.map().zoom())
      .filter(filter);

    let layerLinks = layerList.selectAll('li')
      .data(sources, d => d.name);

    layerLinks.exit()
      .remove();

    let enter = layerLinks.enter()
      .append('li');

    let label = enter
      .append('label');

    label
      .append('input')
      .attr('type', type)
      .attr('name', 'layers')
      .on('change', change);

    label
      .append('span')
      .html(d => d.label);


    layerList.selectAll('li')
      .sort(sortSources);

    layerList
      .call(updateLayerSelections);


    function sortSources(a, b) {
      return a.best && !b.best ? -1
        : b.best && !a.best ? 1
        : d3_descending(a.area, b.area) || d3_ascending(a.name, b.name) || 0;
    }
  }


  function chooseOverlay(d3_event, d) {
    d3_event.preventDefault();
    context.imagery().toggleOverlayLayer(d);
    _overlayList.call(updateLayerSelections);
  }

  function filterOverlay(d) {
    return !d.isHidden() && d.overlay;
  }

  function renderDisclosureContent(selection) {
    let container = selection.selectAll('.layer-overlay-list')
      .data([0]);

    _overlayList = container.enter()
      .append('ul')
      .attr('class', 'layer-list layer-overlay-list')
      .attr('dir', 'auto')
      .merge(container);

    _overlayList
      .call(drawListItems, 'checkbox', chooseOverlay, filterOverlay);
  }


  context.imagery()
    .on('imagerychange', () => section.reRender);

  context.map()
    .on('draw', _debounce(() => {
      // layers in-view may have changed due to map move
      window.requestIdleCallback(section.reRender);
    }, 1000)
  );

  return section;
}
