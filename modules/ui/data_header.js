import { uiIcon } from './icon.js';


export function uiDataHeader(context) {
  const l10n = context.systems.l10n;
  let _datum;

  function dataHeader(selection) {
    let header = selection.selectAll('.data-header')
      .data((_datum ? [_datum] : []), d => d.__featurehash__ );

    header.exit()
      .remove();

    let headerEnter = header.enter()
      .append('div')
      .attr('class', 'data-header');

    let iconEnter = headerEnter
      .append('div')
      .attr('class', 'data-header-icon');

    iconEnter
      .append('div')
      .attr('class', 'preset-icon-28')
      .call(uiIcon('#rapid-icon-data'));

    headerEnter
      .append('div')
      .attr('class', 'data-header-label')
      .html(l10n.tHtml('map_data.layers.custom.title'));
  }


  dataHeader.datum = function(val) {
      if (!arguments.length) return _datum;
      _datum = val;
      return this;
  };


  return dataHeader;
}
