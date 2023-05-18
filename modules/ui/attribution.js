import _throttle from 'lodash-es/throttle';
import { select as d3_select } from 'd3-selection';
import { t } from '../core/localizer';


export function uiAttribution(context) {
  const imagerySystem = context.imagerySystem();
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

        const terms_text = t(`imagery.${d.idtx}.attribution.text`, { default: d.terms_text || d.id || d.name });

        if (d.icon && !d.overlay) {
          attribution
            .append('img')
            .attr('class', 'source-image')
            .attr('src', d.icon);
        }

        attribution
          .append('span')
          .attr('class', 'attribution-text')
          .html(terms_text);
      })
      .merge(attributions);


    let copyright = attributions.selectAll('.copyright-notice')
      .data(d => {
        let notice = d.copyrightNotices(context.map().zoom(), context.map().extent());
        return notice ? [notice] : [];
      });

    copyright.exit()
      .remove();

    copyright = copyright.enter()
      .append('span')
      .attr('class', 'copyright-notice')
      .merge(copyright);

    copyright
      .html(String);
  }


  function update() {
    let baselayer = imagerySystem.baseLayerSource();
    _selection
      .call(render, (baselayer ? [baselayer] : []), 'base-layer-attribution');

    const z = context.map().zoom();
    let overlays = imagerySystem.overlayLayerSources() || [];
    _selection
      .call(render, overlays.filter(s => s.validZoom(z)), 'overlay-layer-attribution');
  }


  return function(selection) {
    _selection = selection;

    imagerySystem.on('imagerychange', update);
    context.map().on('draw', _throttle(update, 400, { leading: false }));

    update();
  };
}
