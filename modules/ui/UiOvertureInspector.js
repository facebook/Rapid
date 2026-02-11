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
   * Renders the 'property-info' section with a clean, human-readable layout.
   * For Places: shows name, category, address, websites, socials prominently.
   * Hides internal fields like id, version, sources, confidence, @-prefixed props.
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

    // Parse all properties up front
    const parsed = {};
    for (const [k, v] of Object.entries(properties)) {
      parsed[k] = this._getJsonStructure(v) ?? v;
    }

    // Track which keys we handle in the "nice" section
    const handledKeys = new Set();

    // --- Name (big & prominent) ---
    const name = this._extractName(parsed);
    if (name) {
      $$propBag.append('div')
        .attr('class', 'property-name')
        .text(name);
    }
    handledKeys.add('name');
    handledKeys.add('names');

    // --- Categories ---
    const categories = this._extractCategories(parsed);
    if (categories.length) {
      const $$catWrap = $$propBag.append('div').attr('class', 'property-categories');
      for (const cat of categories) {
        $$catWrap.append('span').attr('class', 'property-category-tag').text(cat);
      }
    }
    handledKeys.add('categories');

    // --- GERS ID (use raw property value, not parsed) ---
    const gersId = properties.id ?? properties['@id'];
    if (gersId) {
      this._addSection($$propBag, 'GERS ID', $entry => {
        $entry.append('div').attr('class', 'property-value').text(gersId);
      });
    }
    handledKeys.add('id');
    handledKeys.add('@id');

    // --- Address ---
    const address = this._extractAddress(parsed);
    if (address) {
      this._addSection($$propBag, 'Address', $entry => {
        $entry.append('div').attr('class', 'property-value property-address-text').text(address);
      });
    }
    handledKeys.add('addresses');

    // --- Websites ---
    const websites = this._extractArray(parsed.websites);
    if (websites.length) {
      this._addSection($$propBag, 'Websites', $entry => {
        for (const url of websites) {
          $entry.append('a')
            .attr('class', 'property-link')
            .attr('href', url)
            .attr('target', '_blank')
            .attr('rel', 'noopener noreferrer')
            .text(url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''));
        }
      });
    }
    handledKeys.add('websites');

    // --- Socials ---
    const socials = this._extractArray(parsed.socials);
    if (socials.length) {
      this._addSection($$propBag, 'Socials', $entry => {
        for (const url of socials) {
          $entry.append('a')
            .attr('class', 'property-link')
            .attr('href', url)
            .attr('target', '_blank')
            .attr('rel', 'noopener noreferrer')
            .text(url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''));
        }
      });
    }
    handledKeys.add('socials');

    // --- Phones ---
    const phones = this._extractArray(parsed.phones);
    if (phones.length) {
      this._addSection($$propBag, 'Phone', $entry => {
        for (const phone of phones) {
          $entry.append('div').attr('class', 'property-value').text(phone);
        }
      });
    }
    handledKeys.add('phones');

    // --- Confidence ---
    const confidence = parsed.confidence ?? parsed['@confidence'];
    if (confidence !== undefined && confidence !== null) {
      const rounded = Number(confidence).toFixed(2);
      if (!isNaN(rounded)) {
        this._addSection($$propBag, 'Confidence', $entry => {
          $entry.append('div').attr('class', 'property-value').text(rounded);
        });
      }
    }
    handledKeys.add('confidence');
    handledKeys.add('@confidence');

    // --- Remaining properties (raw dump) ---
    const remainingKeys = Object.keys(properties).filter(k => !handledKeys.has(k));
    if (remainingKeys.length) {
      $$propBag.append('div').attr('class', 'property-divider');

      for (const k of remainingKeys) {
        let key = k;
        if (key.startsWith('@')) key = key.slice(1);
        key = key.charAt(0).toUpperCase() + key.slice(1);

        $$propBag.append('div').attr('class', 'property-heading property-heading-minor').text(key);

        const $$tagEntry = $$propBag.append('div').attr('class', 'property-entry');
        const val = parsed[k];

        if (val && typeof val === 'object' && !Array.isArray(val)) {
          for (const [k1, v1] of Object.entries(val)) {
            $$tagEntry.append('div').attr('class', 'property-value').text(k1 + ':' + v1);
          }
        } else if (Array.isArray(val)) {
          for (const entry of val) {
            if (entry && typeof entry === 'object') {
              for (const [k1, v1] of Object.entries(entry)) {
                $$tagEntry.append('div').attr('class', 'property-value').text(k1 + ':' + v1);
              }
            } else {
              $$tagEntry.append('div').attr('class', 'property-value').text(entry);
            }
          }
        } else {
          $$tagEntry.append('div').attr('class', 'property-value').text(properties[k]);
        }
      }
    }

    // update
    $propInfo = $propInfo.merge($$propInfo);
  }


  /**
   * _addSection
   * Helper to append a heading + entry block to the property bag.
   * @param {d3-selection} $bag - parent container
   * @param {string} heading - section label
   * @param {Function} renderFn - called with the entry selection to populate it
   */
  _addSection($bag, heading, renderFn) {
    $bag.append('div').attr('class', 'property-heading').text(heading);
    const $entry = $bag.append('div').attr('class', 'property-entry');
    renderFn($entry);
  }


  /**
   * _extractName
   * Pull the best display name from Overture properties.
   * Tries: names.primary → name → properties.name
   */
  _extractName(parsed) {
    // Try names.primary first (Overture schema)
    const names = parsed.names;
    if (names) {
      if (typeof names === 'object' && !Array.isArray(names) && names.primary) {
        return names.primary;
      }
      if (Array.isArray(names)) {
        const primary = names.find(n => n.primary);
        if (primary) return primary.primary;
      }
    }
    // Fallback to flat name
    if (typeof parsed.name === 'string') return parsed.name;
    return null;
  }


  /**
   * _extractCategories
   * Pull all non-null categories, cleaned up for display.
   * Returns an array like ['library', 'public_building'] with underscores replaced by spaces.
   */
  _extractCategories(parsed) {
    const cats = parsed.categories;
    if (!cats) return [];

    const results = [];

    if (typeof cats === 'string') {
      results.push(cats.replace(/_/g, ' '));
    } else if (Array.isArray(cats)) {
      for (const entry of cats) {
        if (typeof entry === 'string') {
          results.push(entry.replace(/_/g, ' '));
        } else if (entry && typeof entry === 'object') {
          for (const val of Object.values(entry)) {
            if (val && val !== 'null') results.push(String(val).replace(/_/g, ' '));
          }
        }
      }
    } else if (typeof cats === 'object') {
      for (const val of Object.values(cats)) {
        if (val && val !== 'null') results.push(String(val).replace(/_/g, ' '));
      }
    }

    return results;
  }


  /**
   * _extractCategory
   * Pull the primary category, cleaned up for display.
   */
  _extractCategory(parsed) {
    const cats = parsed.categories;
    if (!cats) return null;
    // Object with primary key
    if (typeof cats === 'object' && !Array.isArray(cats) && cats.primary) {
      return cats.primary.replace(/_/g, ' ');
    }
    // Array of objects
    if (Array.isArray(cats)) {
      const primary = cats.find(c => c.primary);
      if (primary) return primary.primary.replace(/_/g, ' ');
    }
    if (typeof cats === 'string') return cats.replace(/_/g, ' ');
    return null;
  }


  /**
   * _extractAddress
   * Build a single-line formatted address from Overture's addresses array.
   */
  _extractAddress(parsed) {
    const addrs = parsed.addresses;
    if (!addrs) return null;

    let addr = addrs;
    if (Array.isArray(addrs) && addrs.length > 0) {
      addr = addrs[0];
    }
    if (typeof addr !== 'object' || Array.isArray(addr)) return null;

    const parts = [];
    if (addr.freeform) parts.push(addr.freeform);
    const cityState = [addr.locality, addr.region].filter(Boolean).join(', ');
    if (cityState) parts.push(cityState);
    if (addr.postcode) parts.push(addr.postcode);
    if (addr.country && !parts.length) parts.push(addr.country);

    return parts.join('  ·  ') || null;
  }


  /**
   * _extractArray
   * Safely extract an array of strings from a parsed property value.
   * Handles: string, array of strings, array of objects, null/undefined.
   */
  _extractArray(val) {
    if (!val) return [];
    if (typeof val === 'string') return [val];
    if (Array.isArray(val)) {
      return val.map(v => (typeof v === 'string') ? v : (v?.url || v?.value || String(v))).filter(Boolean);
    }
    return [];
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
