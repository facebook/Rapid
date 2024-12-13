import { selection } from 'd3-selection';
import { marked } from 'marked';

import { uiIcon } from './icon.js';
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
      .attr('class', 'wordmark-overture');

    $$header
      .append('button')
      .attr('class', 'overture-inspector-close')
      .on('click', () => context.enter('browse'))
      .call(uiIcon('#rapid-icon-close'));

    // add `.body`
    $$inspector
      .append('div')
      .attr('class', 'body');

    // update
    this.$inspector = $inspector = $inspector.merge($$inspector);
    $inspector.selectAll('img.wordmark-overture')
      .attr('src', this.context.assetPath + 'img/omf-wordmark' + rtl + '.svg');

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

    $featureInfo.selectAll('.dataset-label')
      .text(dataset.getLabel());
  }


  /**
   * renderPropertyInfo
   * Renders the 'property-info' section
   * @param {d3-selection} $selection - A d3-selection to a HTMLElement that this content should render itself into
   */
  renderPropertyInfo($selection) {
    const properties = this.datum?.geojson.properties;
    if (!properties) return;

    let $propInfo = $selection.selectAll('.property-info')
      .data([0]);

    // enter
    const $$propInfo = $propInfo.enter()
      .append('div')
      .attr('class', 'property-info');

    const $$propBag = $$propInfo
      .append('div')
      .attr('class', 'property-bag');


    // Overture properties can come to us as strings, JSON arrays, or JSON objects. Handle all three!
    for (const [k, v] of Object.entries(properties)) {
      const $$propHeading = $$propBag
        .append('div')
        .attr('class', 'property-heading');

      let key = k;

      // Some params come to us via pmtiles with a prepended '@' sign.
      if (key.startsWith('@')) {
        key = key.slice(1);
      }
      key = key.charAt(0).toUpperCase() + key.slice(1);
      $$propHeading.text(key);

      const $$tagEntry = $$propBag.append('div').attr('class', 'property-entry');
      const parsedJson = this._getJsonStructure(v);
      if (parsedJson === null) continue;

      if (Object.keys(parsedJson).length !== 0) {
        // Object processing
        if (!Array.isArray(parsedJson)) {
          for (const [k1, v1] of Object.entries(parsedJson)) {
            $$tagEntry.append('div').attr('class', 'property-value').text(k1 + ':' + v1);
          }

        // Array processing
        } else {
          for (const entry of parsedJson) {
            if (entry instanceof Object ) {
              for (const [k1,v1] of Object.entries(entry)){
                $$tagEntry.append('div').attr('class', 'property-value').text(k1 + ':' + v1);
              }
            } else {
              $$tagEntry.append('div').attr('class', 'property-value').text(entry);
            }
          }
        }
      } else {
        // String handling- just make a key/value pair.
        $$tagEntry.append('div').attr('class', 'property-value').text(v);
      }
    }

    // update
    $propInfo = $propInfo.merge($$propInfo);
  }


  /**
   * _getJsonStructure is used to test the values we receive from the Overture data, which may be strings, Json arrays, or Json objects.
   * @returns null if the str isn't a string, empty object {} if the string can't be parsed into JSON, or the parsed object.
   */
  _getJsonStructure(str) {
    if (typeof str !== 'string') return null;
    try {
      const result = JSON.parse(str);
      return result;
    } catch (err) {
      return {};
    }
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
    if (dataset.tags.has('opendata') && dataset.licenseUrl) {
      let $notice = $selection.selectAll('.overture-inspector-notice')
        .data([0]);

      // enter
      const $$notice = $notice.enter()
        .append('div')
        .attr('class', 'overture-inspector-notice');

      // update
      $notice = $notice.merge($$notice);

      $notice
        .html(marked.parse(l10n.t('rapid_inspector.notice.open_data', { url: dataset.licenseUrl })));

      $notice.selectAll('a')   // links in markdown should open in new page
        .attr('target', '_blank');
    }

  }
}
