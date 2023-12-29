import { descending as d3_descending, ascending as d3_ascending } from 'd3-array';
import { select as d3_select } from 'd3-selection';
import debounce from 'lodash-es/debounce';

import { uiTooltip } from '../tooltip';
import { uiSection } from '../section';


export function uiSectionOverlayList(context) {
  const map = context.systems.map;
  const l10n = context.systems.l10n;
  const imagery = context.systems.imagery;

  const section = uiSection(context, 'overlay-list')
    .label(l10n.t('background.overlays'))
    .disclosureContent(renderDisclosureContent);

  let _overlayList = d3_select(null);

  function setTooltips(selection) {
    selection.each((d, i, nodes) => {
      const item = d3_select(nodes[i]).select('label');
      const span = item.select('span');
      const placement = (i < nodes.length / 2) ? 'bottom' : 'top';
      const isOverflowing = (span.property('clientWidth') !== span.property('scrollWidth'));

      item.call(uiTooltip(context).destroyAny);

      if (d.description || isOverflowing) {
        item.call(uiTooltip(context)
          .placement(placement)
          .title(d.description || d.name)
        );
      }
    });
  }


  function updateLayerSelections(selection) {
    function isActive(d) {
      return imagery.showsLayer(d);
    }

    selection.selectAll('li')
      .classed('active', isActive)
      .call(setTooltips)
      .selectAll('input')
      .property('checked', isActive);
  }


  function drawListItems(selection) {
    let sources = imagery
      .sources(map.extent(), map.zoom())
      .filter(isOverlay);

    let layerLinks = selection.selectAll('li')
      .data(sources, d => d.name);

    layerLinks.exit()
      .remove();

    let enter = layerLinks.enter()
      .append('li');

    let label = enter
      .append('label');

    label
      .append('input')
      .attr('type', 'checkbox')
      .attr('name', 'layers')
      .on('change', chooseOverlay);

    label
      .append('span')
      .text(d => d.name);


    selection.selectAll('li')
      .sort(sortSources);

    selection
      .call(updateLayerSelections);


    function sortSources(a, b) {
      return a.best && !b.best ? -1
        : b.best && !a.best ? 1
        : d3_descending(a.area, b.area) || d3_ascending(a.name, b.name) || 0;
    }
  }


  function chooseOverlay(d3_event, d) {
    d3_event.preventDefault();
    imagery.toggleOverlayLayer(d);
    _overlayList.call(updateLayerSelections);
  }

  function isOverlay(d) {
    return !!d.overlay;
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
      .call(drawListItems);
  }


  imagery
    .on('imagerychange', () => section.reRender);

  map
    .on('draw', debounce(() => {
      // layers in-view may have changed due to map move
      window.requestIdleCallback(section.reRender);
    }, 1000, { leading: true, trailing: true })
  );

  return section;
}
