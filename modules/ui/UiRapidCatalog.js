import { EventEmitter } from 'pixi.js';
import { select } from 'd3-selection';
import { marked } from 'marked';

import { uiIcon } from './icon.js';
import { uiCombobox} from './combobox.js';
import { utilKeybinding, utilNoAuto } from '../util/index.js';

const MAXRESULTS = 100;


/**
 * UiRapidCatalog
 * This is the modal where the user can browse the catalog of datasets.
 *
 * Events available:
 *   `done`   Fires when the user is finished and they are closing this modal
 */
export class UiRapidCatalog extends EventEmitter {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context, $parentModal) {
    super();
    this.context = context;

    this._filterText = null;
    this._filterCategory = null;
    this._myClose = () => true;   // custom close handler

    // Child components
    this.CategoryCombo = uiCombobox(context, 'dataset-categories');

    // D3 selections
    this.$parentModal = $parentModal;
    this.$wrap = null;
    this.$modal = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.show = this.show.bind(this);
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument
    this.renderDatasets = this.renderDatasets.bind(this);
    this.sortCategories = this.sortCategories.bind(this);
    this.sortDatasets = this.sortDatasets.bind(this);
    this.toggleDataset = this.toggleDataset.bind(this);
    this.highlight = this.highlight.bind(this);

    // Setup event handlers
    const l10n = context.systems.l10n;
    l10n.on('localechange', this.rerender);
  }


  /**
   * show
   * This shows the catalog if it isn't alreaday being shown.
   * For this kind of popup component, must first `show()` to create the modal.
   */
  show() {
    const context = this.context;
    const $container = context.container();   // $container is always the parent for a modal

    // Unfortunately `uiModal` is written in a way that there can be only one at a time.
    // So we need to roll our own modal here instead of just creating a second `uiModal`.
    const $shaded = $container.selectAll('.shaded');  // container for the existing modal
    if ($shaded.empty()) return;
    if ($shaded.selectAll('.modal-catalog').size()) return;  // catalog modal exists already

    const origClose = this.$parentModal.close;
    this.$parentModal.close = () => { /* ignore */ };

    // override the close handler
    this._myClose = () => {
      this._filterText = null;
      this._filterCategory = null;
      this.$modal
        .transition()
        .duration(200)
        .style('top', '0px')
        .on('end', () => this.$wrap.remove());

      this.$parentModal.close = origClose;  // restore close handler

      let keybinding = utilKeybinding('modal');
      keybinding.on(['⌫', '⎋'], origClose);
      select(document).call(keybinding);
      this.emit('done');
    };


    let keybinding = utilKeybinding('modal');
    keybinding.on(['⌫', '⎋'], this._myClose);
    select(document).call(keybinding);

    let $wrap = $shaded.selectAll('.catalog-wrap')
      .data([0]);

    // enter
    const $$wrap = $wrap.enter()
      .append('div')
      .attr('class', 'catalog-wrap');  // need absolutely positioned div here for new stacking context

    const $$modal = $$wrap
      .append('div')
      .attr('class', 'modal rapid-modal modal-catalog')  // Rapid styling
      .style('opacity', 0);

    $$modal
      .append('button')
      .attr('class', 'close')
      .on('click', this._myClose)
      .call(uiIcon('#rapid-icon-close'));

    $$modal
      .append('div')
      .attr('class', 'content rapid-stack');

    // update
    this.$wrap = $wrap = $wrap.merge($$wrap);
    this.$modal = $wrap.selectAll('.modal-catalog');

    this.$modal
      .transition()
      .style('opacity', 1);

    this.render();
  }


  /**
   * render
   * Renders the content inside the modal.
   * Note that most `render` functions accept a parent selection,
   *  this one doesn't need it - `$modal` is always the parent.
   */
  render() {
    if (!this.$modal) return;  // need to call `show()` first to create the modal.

    const context = this.context;
    const l10n = context.systems.l10n;
    const $content = this.$modal.selectAll('.content');

    /* Header section */
    let $header = $content.selectAll('.rapid-catalog-header')
      .data([0]);

    const $$header = $header.enter()
      .append('div')
      .attr('class', 'modal-section rapid-catalog-header');

    const $$line1 = $$header
      .append('div');

    $$line1
      .append('div')
      .attr('class', 'rapid-catalog-header-icon')
      .call(uiIcon('#rapid-icon-data', 'icon-30'));

    $$line1
      .append('div')
      .attr('class', 'rapid-catalog-header-text');

    const $$line2 = $$header
      .append('div');

    $$line2
      .append('div')
      .attr('class', 'rapid-catalog-header-about');

    // update
    $header = $header.merge($$header);

    $header.selectAll('.rapid-catalog-header-text')
      .text(l10n.t('rapid_feature_toggle.esri.title'));

    $header.selectAll('.rapid-catalog-header-about')
      .html(marked.parse(l10n.t('rapid_feature_toggle.esri.about')));

    $header.selectAll('.rapid-catalog-header-about a')
      .attr('target', '_blank');   // make sure the markdown links go to a new page


    /* Filter section */
    let $filter = $content.selectAll('.rapid-catalog-filter')
      .data([0]);

    // enter
    const $$filter = $filter.enter()
      .append('div')
      .attr('class', 'modal-section rapid-catalog-filter');

    const $$filterSearch = $$filter
      .append('div')
      .attr('class', 'rapid-catalog-filter-search-wrap');

    $$filterSearch
      .call(uiIcon('#fas-filter', 'inline'));

    $$filterSearch
      .append('input')
      .attr('class', 'rapid-catalog-filter-search')
      .call(utilNoAuto)
      .on('input', e => {
        const element = e.currentTarget;
        const val = (element && element.value) || '';
        this._filterText = val.trim().toLowerCase();
        $datasets.call(this.renderDatasets);
      });

    // set focus (but only on enter)
    const inputNode = $$filterSearch.selectAll('.rapid-catalog-filter-search').node();
    if (inputNode) inputNode.focus();


    const $$filterType = $$filter
      .append('div')
      .attr('class', 'rapid-catalog-filter-type-wrap');

    $$filterType
      .append('input')
      .attr('class', 'rapid-catalog-filter-type')
      .call(utilNoAuto)
      .call(this.CategoryCombo)
      .on('blur change', e => {
        const element = e.currentTarget;
        const val = (element && element.value) || '';
        const data = this.CategoryCombo.data();
        if (data.some(item => item.value === val)) {  // only allow picking values from the list
          this._filterCategory = val;
        } else {
          e.currentTarget.value = '';
          this._filterCategory = null;
        }
        $datasets.call(this.renderDatasets);
      });

    $$filter
      .append('div')
      .attr('class', 'rapid-catalog-filter-clear')
      .append('a')
      .attr('href', '#')
      .on('click', e => {
        e.preventDefault();
        const element = e.currentTarget;
        element.blur();
        $content.selectAll('input').property('value', '');
        this._filterText = null;
        this._filterCategory = null;
        $datasets.call(this.renderDatasets);
      });

    $$filter
      .append('div')
      .attr('class', 'rapid-catalog-filter-results');

    // update
    $filter = $filter.merge($$filter);

    $filter.selectAll('.rapid-catalog-filter-search')
      .attr('placeholder', l10n.t('rapid_feature_toggle.filter_datasets'));

    $filter.selectAll('.rapid-catalog-filter-type')
      .attr('placeholder', l10n.t('rapid_feature_toggle.any_type'));

    $filter.selectAll('.rapid-catalog-filter-clear > a')
      .text(l10n.t('rapid_feature_toggle.clear_filters'));


    /* Dataset section */
    let $datasets = $content.selectAll('.rapid-catalog-datasets-section')
      .data([0]);

    // enter
    const $$datasets = $datasets.enter()
      .append('div')
      .attr('class', 'modal-section rapid-catalog-datasets-section');

    $$datasets
      .append('div')
      .attr('class', 'rapid-catalog-datasets-status');

    $$datasets
      .append('div')
      .attr('class', 'rapid-catalog-datasets');

    // update
    $datasets = $datasets.merge($$datasets);

    $datasets
      .call(this.renderDatasets);


    /* OK Button */
    let $buttons = $content.selectAll('.modal-section.buttons')
      .data([0]);

    // enter
    const $$buttons = $buttons.enter()
      .append('div')
      .attr('class', 'modal-section buttons');

    $$buttons
      .append('button')
      .attr('class', 'button ok-button action')
      .on('click', this._myClose);

    // update
    $buttons = $buttons.merge($$buttons);

    $buttons.selectAll('.button')
      .text(l10n.t('confirm.okay'));
  }


  /**
   * renderDatasets
   * Renders datasets details into the `.rapid-catalog-datasets-section` div.
   * @param {d3-selection} $selection - A d3-selection to a HTMLElement that this component should render itself into
   */
  renderDatasets($selection) {
    if (!this.$modal) return;  // need to call `show()` first to create the modal.

    const context = this.context;
    const l10n = context.systems.l10n;
    const rapid = context.systems.rapid;
    const storage = context.systems.storage;
    const $content = this.$modal.selectAll('.content');

    const showPreview = storage.getItem('rapid-internal-feature.previewDatasets') === 'true';

    const $status = $selection.selectAll('.rapid-catalog-datasets-status');
    const $results = $selection.selectAll('.rapid-catalog-datasets');

    if (!rapid.catalog.size) {
      $results.classed('hide', true);
      $status.classed('hide', false).text(l10n.t('rapid_feature_toggle.no_datasets'));
      return;
    }

    $results.classed('hide', false);
    $status.classed('hide', true);

    // Update categories combo
    // (redo it every time, in case the user toggles preview datasets on/off)
    const categories = new Set(rapid.categories);  // make copy
    if (!showPreview) categories.delete('preview');

    const comboData = Array.from(categories).sort().map(d => {
      const display = l10n.t(`rapid_feature_toggle.category.${d}`, { default: d });
      const item = { display: display, title: d, value: d };
      if (d === 'preview') item.display = `${display} <span class="rapid-catalog-dataset-beta beta"></span>`;
      return item;
    });

    this.CategoryCombo.data(comboData);


    // Gather datasets..
    let count = 0;
    const datasets = [...rapid.catalog.values()]
      .filter(d => !d.hidden)
      .sort(this.sortDatasets);

    // Apply filters..
    for (const d of datasets) {
      const label = d.getLabel().toLowerCase();
      const description = d.getDescription().toLowerCase();

      if (d.added) {  // always show added datasets at the top of the list
        d.filtered = false;
        ++count;
        continue;
      }
      if (this._filterText && !label.includes(this._filterText) && !description.includes(this._filterText)) {
        d.filtered = true;   // filterText not found anywhere in `label` or `description`
        continue;
      }
      if (this._filterCategory && !(d.categories.has(this._filterCategory))) {
        d.filtered = true;   // filterCategory not found anywhere in `categories``
        continue;
      }

      d.filtered = (++count > MAXRESULTS);
    }

    // The datasets
    let $datasets = $results.selectAll('.rapid-catalog-dataset')
      .data(datasets, d => d.id);

    // exit
    $datasets.exit()
      .remove();

    // enter
    const $$datasets = $datasets.enter()
      .append('div')
      .attr('class', 'rapid-catalog-dataset');

    const $$label = $$datasets
      .append('div')
      .attr('class', 'rapid-catalog-dataset-label');

    $$label
      .append('div')
      .attr('class', 'rapid-catalog-dataset-name');

    const $$categories = $$label
      .append('div')
      .attr('class', 'dataset-categories');

    $$categories.selectAll('.dataset-category')
      .data(d => {
        const categories = new Set(d.categories);  // make copy
        if (d.beta) categories.add('preview');     // make sure beta datasets have 'preview' category
        return Array.from(categories).sort(this.sortCategories);
      }, d => d)
      .enter()
      .append('div')
      .attr('class', d => {
        // include 'beta' class for preview category
        return `dataset-category dataset-category-${d}` + (d === 'preview' ? ' beta' : '');
      });

    $$label
      .append('div')
      .attr('class', 'rapid-catalog-dataset-snippet');

    const $$link = $$label
      .filter(d => d.itemUrl)
      .append('div')
      .attr('class', 'rapid-catalog-dataset-more-info')
      .append('a')
      .attr('class', 'rapid-catalog-dataset-link')
      .attr('target', '_blank')
      .attr('href', d => d.itemUrl);

    $$link
      .append('span')
      .attr('class', 'rapid-catalog-dataset-link-text');

    $$link
      .call(uiIcon('#rapid-icon-out-link', 'inline'));

    $$label
      .append('button')
      .attr('class', 'rapid-catalog-dataset-action')
      .on('click', this.toggleDataset);

    const $$thumbnail = $$datasets
      .append('div')
      .attr('class', 'rapid-catalog-dataset-thumb');

    $$thumbnail
      .append('img')
      .attr('class', 'rapid-catalog-dataset-thumbnail')
      .classed('inverted', d => d.categories.has('esri'))  // invert colors from light->dark
      .attr('src', d => d.thumbnailUrl);

    // update
    $datasets = $datasets.merge($$datasets);

    $datasets
      .classed('hide', d => d.filtered);

    $datasets.selectAll('.rapid-catalog-dataset-name')
      .html(d => this.highlight(this._filterText, d.getLabel()));

    $datasets.selectAll('.rapid-catalog-dataset-link-text')
      .text(l10n.t('rapid_feature_toggle.more_info'));

    $$datasets.selectAll('.dataset-category')
      .text(d => {
        if (d === 'preview') return '';
        const star = (d === 'featured') ? '\u2b50 ' : '';   // emoji star
        const text = l10n.t(`rapid_feature_toggle.category.${d}`, { default: d });
        return star + text;
      });

    $datasets.selectAll('.dataset-category-preview')
      .attr('title', l10n.t('rapid_poweruser_features.beta'));  // alt text

    $datasets.selectAll('.rapid-catalog-dataset-snippet')
      .html(d => this.highlight(this._filterText, d.getDescription()));

    $datasets.selectAll('.rapid-catalog-dataset-action')
      .classed('secondary', d => d.added)
      .text(d => d.added ? l10n.t('rapid_feature_toggle.remove') : l10n.t('rapid_feature_toggle.add_dataset'));

    // update the count
    const n = datasets.filter(d => !d.filtered).length;
    const gt = (count > MAXRESULTS) ? '>' : '';
    $content.selectAll('.rapid-catalog-filter-results')
      .text(l10n.t('rapid_feature_toggle.datasets_found', { n: n, gt: gt }));
  }


  /**
   * sortDatasets
   * Added datasets to the beginning
   * Featured datasets next
   * All others sort by name
   */
  sortDatasets(a, b) {
    return a.added && !b.added ? -1
      : b.added && !a.added ? 1
      : a.featured && !b.featured ? -1
      : b.featured && !a.featured ? 1
      : a.label.localeCompare(b.label);
  }


  /**
   * sortCategories
   * Featured before everything else
   * Preview after everything else
   * All others sort alphabetically
   */
  sortCategories(a, b) {
    return a === 'featured' && b !== 'featured' ? -1
      : b === 'featured' && a !== 'featured' ? 1
      : a === 'preview' && b !== 'preview' ? 1
      : b === 'preview' && a !== 'preview' ? -1
      : a.localeCompare(b);
  }


  /**
   * toggleDataset
   * Toggles the given dataset between added/removed.
   * @param  {Event}         e? - triggering event (if any)
   * @param  {RapidDataset}  d - bound datum (the dataset in this case)
   */
  toggleDataset(e, d) {
    const context = this.context;
    const rapid = context.systems.rapid;
    const added = rapid.datasets;

    if (added.has(d.id)) {
      rapid.removeDatasets(d.id);  // remove from menu and disable/uncheck
    } else {
      rapid.enableDatasets(d.id);  // add to menu and enable/check
      // If adding an Esri building dataset, disable the Microsoft buildings to avoid clutter
      if (d.categories.has('esri') && d.categories.has('buildings') && added.has('msBuildings')) {
        rapid.disableDatasets('msBuildings');
      }
    }
    context.enter('browse');   // return to browse mode (in case something was selected)
    this.render();
  }


  /**
   * highlight
   */
  highlight(needle, haystack) {
    let html = haystack;
    if (needle) {
      const re = new RegExp('\(' + _escapeRegex(needle) + '\)', 'gi');
      html = html.replace(re, '<mark>$1</mark>');
    }

    return html;

    function _escapeRegex(s) {
      return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }
  }

}

