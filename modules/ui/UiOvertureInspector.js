import { select, selection } from 'd3-selection';
import { marked } from 'marked';

import { uiIcon } from './icon.js';
import { uiFlash } from './flash.js';
import { uiTooltip } from './tooltip.js';



/**
 * UiOvertureInspector
 * The OvertureInspector is a UI component for viewing Overture Entities in the sidebar.
 * Because Overture entities conform to a certain schema, we might at some point build a JSON-Schema-aware 
 * version of this code that modifies the display of the data. 
 *
 * @example
 *  <div class='overture-inspector'>
 *    <div class='header'>…</div>
 *    <div class='body'>
 *      <div class='theme-info'/>              // Theme name, e.g. "Places" or "Addresses"
 *      <div class='property-info'/>           // List of properties on this feature
 *    </div>
 *  </div>
 */
export class UiOvertureInspector {
  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this.datum = null;
    this._keys = null;

    // D3 selections
    this.$parent = null;
    this.$inspector = null;

    // Create child components
    this.AcceptTooltip = uiTooltip(context).placement('bottom');
    this.IgnoreTooltip = uiTooltip(context).placement('bottom');

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.renderFeatureInfo = this.renderFeatureInfo.bind(this);
    this.renderPropertyInfo = this.renderPropertyInfo.bind(this);
    this.renderNotice = this.renderNotice.bind(this);
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders.)
   * @param {d3-selection} $parent - A d3-selection to a HTMLElement that this component should render itself into
   */
  render($parent = this.$parent) {
    if ($parent instanceof selection) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    const context = this.context;
    const l10n = context.systems.l10n;
    const rtl = l10n.isRTL() ? '-rtl' : '';

    let $inspector = $parent.selectAll('.overture-inspector')
      .data([0]);

    const $$inspector = $inspector.enter()
      .append('div')
      .attr('class', 'overture-inspector');


    // add `.header`
    const $$header = $$inspector
      .append('div')
      .attr('class', 'header');

    $$header
      .append('h3')
      .append('img')
      .attr('class', 'wordmark-overture')
      .attr('src', this.context.assetPath + 'img/omf-wordmark.svg');

    $$header
      .append('button')
      .attr('class', 'overture-inspector-close')
      .on('click', () => context.enter('browse'))
      .call(uiIcon('#overture-icon-close'));

    // add `.body`
    $$inspector
      .append('div')
      .attr('class', 'body');

    // update
    this.$inspector = $inspector = $inspector.merge($$inspector);

    // localize logo
    $inspector.selectAll('.logo-overture > use')
      .attr('xlink:href', `#overture-logo-overture-wordmark${rtl}`);

    $inspector.selectAll('.body')
      .call(this.renderFeatureInfo)
      .call(this.renderPropertyInfo)
      .call(this.renderNotice);
  }


  /**
   * getBrightness
   * This is used to get the brightness of the given hex color.
   * (We use this to know whether text written over this color should be light or dark).
   * https://www.w3.org/TR/AERT#color-contrast
   * https://stackoverflow.com/questions/49437263/contrast-between-label-and-background-determine-if-color-is-light-or-dark/49437644#49437644
   * @param  {string} color - a hexstring like '#rgb', '#rgba', '#rrggbb', '#rrggbbaa'  (alpha values are ignored)
   * @return {number} A number representing the perceived brightness
   */
  getBrightness(color) {
    const short = (color.length < 6);
    const r = parseInt(short ? color[1] + color[1] : color[1] + color[2], 16);
    const g = parseInt(short ? color[2] + color[2] : color[3] + color[4], 16);
    const b = parseInt(short ? color[3] + color[3] : color[5] + color[6], 16);
    return ((r * 299) + (g * 587) + (b * 114)) / 1000;
  }


  /**
   * renderFeatureInfo
   * Renders the 'feature-info' section (the dataset name)
   * @param {d3-selection} $selection - A d3-selection to a HTMLElement that this content should render itself into
   */
  renderFeatureInfo($selection) {
    const datum = this.datum;
    if (!datum) return;

    const context = this.context;
    const l10n = context.systems.l10n;
    const rapid = context.systems.rapid;

    const datasetID = datum.__datasetid__;
    const dataset = rapid.datasets.get(datasetID);
    const color = dataset.color;

    let $featureInfo = $selection.selectAll('.feature-info')
      .data([0]);

    // enter
    const $$featureInfo = $featureInfo.enter()
      .append('div')
      .attr('class', 'feature-info');

    $$featureInfo
      .append('div')
      .attr('class', 'dataset-label');

    // update
    $featureInfo = $featureInfo.merge($$featureInfo);

    $featureInfo
      .style('background', color)
      .style('color', this.getBrightness(color) > 140.5 ? '#333' : '#fff');

    // Attempt to localize the dataset name, fallback to 'label' or 'id'
    const text = dataset.labelStringID ? l10n.t(dataset.labelStringID) : (dataset.label || dataset.id);
    $featureInfo.selectAll('.dataset-label')
      .text(text);
  }


  /**
   * renderPropertyInfo
   * Renders the 'property-info' section
   * @param {d3-selection} $selection - A d3-selection to a HTMLElement that this content should render itself into
   */
  renderPropertyInfo($selection) {
    const properties = this.datum?.geojson.properties;
    if (!properties) return;

    const context = this.context;
    const l10n = context.systems.l10n;

    let $propInfo = $selection.selectAll('.property-info')
      .data([0]);

    // enter
    const $$propInfo = $propInfo.enter()
      .append('div')
      .attr('class', 'property-info');

    const $$propBag = $$propInfo
      .append('div')
      .attr('class', 'property-bag');

    $$propBag
      .append('div')
      .attr('class', 'property-heading');

    for (const [k, v] of Object.entries(properties)) {
      const $$tagEntry = $$propBag.append('div').attr('class', 'property-entry');
      $$tagEntry.append('div').attr('class', 'property-key').text(k);
      $$tagEntry.append('div').attr('class', 'property-value').text(v);
    }

    // update
    $propInfo = $propInfo.merge($$propInfo);

    $propInfo.selectAll('.tag-heading')
      .text(l10n.t('overture_feature_inspector.properties'));
  }



  /**
   * renderNotice
   * Renders the 'overture-inspector-notice' section
   * This section contains remarks about the data - license, usage, or other hints
   * @param {d3-selection} $selection - A d3-selection to a HTMLElement that this content should render itself into
   */
  renderNotice($selection) {
    const context = this.context;
    const l10n = context.systems.l10n;
    const rapid = context.systems.rapid;
    const datum = this.datum;
    if (!datum) return;

    const datasetID = datum.__datasetid__.replace('-conflated', '');
    const dataset = rapid.datasets.get(datasetID);

    // Only display notice data for open data (for now)
    if (dataset.tags?.includes('opendata')) {

      let $notice = $selection.selectAll('.overture-inspector-notice')
      .data([0]);

      // enter
      const $$notice = $notice.enter()
        .append('div')
        .attr('class', 'overture-inspector-notice');

      $$notice
        .html(marked.parse(l10n.t('rapid_feature_inspector.notice.open_data', {license: dataset.license_markdown})));

      // update
      $notice = $notice.merge($$notice);
    }

  }
}
