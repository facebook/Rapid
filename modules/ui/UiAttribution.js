import { selection, select } from 'd3-selection';
import throttle from 'lodash-es/throttle.js';


/**
 * UiAttribution
 * The Attribution compnoent shows attribution for the imagery layers.
 */
export class UiAttribution {

  /**
   * @constructor
   * @param  `conttext`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument
    this.throttledRender = throttle(this.rerender, 400, { leading: false });

    context.systems.imagery.on('imagerychange', this.rerender);
    context.systems.map.on('draw', this.throttledRender);
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders)
   * @param {d3-selection} $parent - A d3-selection to a HTMLElement that this component should render itself into
   */
  render($parent = this.$parent) {
    if ($parent instanceof selection) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    const context = this.context;
    const imagery = context.systems.imagery;
    const l10n = context.systems.l10n;
    const storage = context.systems.storage;
    const showThirdPartyIcons = (storage.getItem('preferences.privacy.thirdpartyicons') ?? 'true') === 'true';

    // attribution wrapper
    let $wrap = $parent.selectAll('.attribution-wrap')
      .data([0]);

    const $$wrap = $wrap.enter()
      .append('div')
      .attr('class', 'attribution-wrap');

    $wrap = $wrap.merge($$wrap);


    // attribution sections for baselayer and overlays
    const data = [];

    const baselayer = imagery.baseLayerSource();
    if (baselayer) {
      data.push({ id: 'base-layer-attribution', sources: [baselayer] });
    }

    const overlays = imagery.overlayLayerSources();
    if (Array.isArray(overlays)) {
      data.push({ id: 'overlay-layer-attribution', sources: overlays });
    }

    let $sections = $wrap.selectAll('.attribution-section')
      .data(data, d => d.id);

    $sections.exit()
      .remove();

    const $$sections = $sections.enter()
      .append('div')
      .attr('class', d => `attribution-section ${d.id}`);

    $sections = $sections.merge($$sections);


    // attribution links
    let $attributions = $sections.selectAll('.attribution')
      .data(d => d.sources, d => d.id);

    $attributions.exit()
      .remove();

    const $$attributions = $attributions.enter()
      .append('a')
      .attr('class', 'attribution')
      .attr('target', '_blank')
      .attr('href', d => d.terms_url || null)
      .each((d, i, nodes) => {
        const $$link = select(nodes[i]);

        // add html directly (maybe we shouldn't?)
        if (d.terms_html) {
          $$link.html(d.terms_html);
          return;
        }

        if (d.icon && !d.overlay && showThirdPartyIcons) {
          $$link
            .append('img')
            .attr('class', 'attribution-image')
            .attr('src', d.icon);
        }

        $$link
          .append('span')
          .attr('class', 'attribution-text');
      });

    // update
    $attributions = $attributions.merge($$attributions);

    $attributions.selectAll('.attribution-text')
      .text(d => {
        return l10n.t(`_imagery.imagery.${d.idtx}.attribution.text`, {
          default: d.terms_text || d.id || d.name
        });
      });
  }
}
