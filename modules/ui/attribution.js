import _throttle from 'lodash-es/throttle.js';
import { select as d3_select } from 'd3-selection';


export function uiAttribution(context) {
  const imagery = context.systems.imagery;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const viewport = context.viewport;

  let _selection = d3_select(null);


  function render(selection, imagerySource, klass) {
    let div = selection.selectAll(`.${klass}`)
      .data([0]);

    div = div.enter()
      .append('div')
      .attr('class', klass)
      .merge(div);


    let attributions = div.selectAll('.attribution')
      .data(imagerySource, d => d.id);

    attributions.exit()
      .remove();

    attributions = attributions.enter()
      .append('span')
      .attr('class', 'attribution')
      .each((d, i, nodes) => {
        let attribution = d3_select(nodes[i]);

        if (d.terms_html) {
          attribution.html(d.terms_html);
          return;
        }

        if (d.terms_url) {
          attribution = attribution
            .append('a')
            .attr('href', d.terms_url)
            .attr('target', '_blank');
        }

        const terms_text = l10n.t(`_imagery.imagery.${d.idtx}.attribution.text`, { default: d.terms_text || d.id || d.name });

        if (d.icon && !d.overlay) {
          attribution
            .append('img')
            .attr('class', 'source-image')
            .attr('src', d.icon);
        }

        attribution
          .append('span')
          .attr('class', 'attribution-text')
          .text(terms_text);
      })
      .merge(attributions);
  }


  function update() {
    let baselayer = imagery.baseLayerSource();
    _selection
      .call(render, (baselayer ? [baselayer] : []), 'base-layer-attribution');

    const z = viewport.transform.zoom;
    let overlays = imagery.overlayLayerSources() || [];
    _selection
      .call(render, overlays.filter(s => s.validZoom(z)), 'overlay-layer-attribution');
  }


  return function(selection) {
    _selection = selection;

    imagery.on('imagerychange', update);
    map.on('draw', _throttle(update, 400, { leading: false }));

    update();
  };
}
