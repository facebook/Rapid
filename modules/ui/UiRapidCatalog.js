import { EventEmitter } from 'pixi.js';
import { select } from 'd3-selection';
import { Extent } from '@rapid-sdk/math';
import { marked } from 'marked';

import { RapidDataset } from '../core/lib/RapidDataset.js';
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

    this._datasetInfo = null;
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
    this.isDatasetAdded = this.isDatasetAdded.bind(this);
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
      .attr('placeholder', l10n.t('rapid_feature_toggle.esri.filter_datasets'));

    $filter.selectAll('.rapid-catalog-filter-type')
      .attr('placeholder', l10n.t('rapid_feature_toggle.esri.any_type'));

    $filter.selectAll('.rapid-catalog-filter-clear > a')
      .text(l10n.t('rapid_feature_toggle.esri.clear_filters'));


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

    // set focus (but only on enter)
    const buttonNode = $$buttons.selectAll('button').node();
    if (buttonNode) buttonNode.focus();

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
    const assets = context.systems.assets;
    const l10n = context.systems.l10n;
    const storage = context.systems.storage;
    const $content = this.$modal.selectAll('.content');

    const showPreview = storage.getItem('rapid-internal-feature.previewDatasets') === 'true';
    const esri = context.services.esri;

    const $status = $selection.selectAll('.rapid-catalog-datasets-status');
    const $results = $selection.selectAll('.rapid-catalog-datasets');

    if (!esri || (Array.isArray(this._datasetInfo) && !this._datasetInfo.length)) {
      $results.classed('hide', true);
      $status.classed('hide', false).text(l10n.t('rapid_feature_toggle.esri.no_datasets'));
      return;
    }

    if (!this._datasetInfo) {
      $results.classed('hide', true);
      $status.classed('hide', false)
        .text(l10n.t('rapid_feature_toggle.esri.fetching_datasets'));

      $status
        .append('br');

      $status
        .append('img')
        .attr('class', 'rapid-catalog-datasets-spinner')
        .attr('src', assets.getFileURL('img/loader-black.gif'));

      esri.startAsync()
        .then(() => esri.loadDatasetsAsync())
        .then(results => {
          // Build set of available categories
          let categories = new Set();

          Object.values(results).forEach(d => {
            d.groupCategories.forEach(c => {
              categories.add(c.toLowerCase().replace('/categories/', ''));
            });
          });
          if (!showPreview) categories.delete('preview');

          const combodata = Array.from(categories).sort().map(c => {
            let item = { title: c, value: c };
            if (c === 'preview') item.display = `${c} <span class="rapid-catalog-dataset-beta beta"></span>`;
            return item;
          });
          this.CategoryCombo.data(combodata);

          // Exclude preview datasets unless user has opted into them
          this._datasetInfo = Object.values(results)
            .filter(d => showPreview || !d.groupCategories.some(category => category.toLowerCase() === '/categories/preview'));
        })
        .then(() => this.rerender());

      return;
    }

    $results.classed('hide', false);
    $status.classed('hide', true);

    // Apply filters
    let count = 0;
    this._datasetInfo.forEach(d => {
      const title = (d.title || '').toLowerCase();
      const snippet = (d.snippet || '').toLowerCase();

      if (this.isDatasetAdded(d)) {  // always show added datasets at the top of the list
        d.filtered = false;
        ++count;
        return;
      }
      if (this._filterText && title.indexOf(this._filterText) === -1 && snippet.indexOf(this._filterText) === -1) {
        d.filtered = true;   // filterText not found anywhere in `title` or `snippet`
        return;
      }
      if (this._filterCategory && !(d.groupCategories.some(category => category.toLowerCase() === `/categories/${this._filterCategory}`))) {
        d.filtered = true;   // filterCategory not found anywhere in `groupCategories``
        return;
      }

      d.filtered = (++count > MAXRESULTS);
    });


    let $datasets = $results.selectAll('.rapid-catalog-dataset')
      .data(this._datasetInfo, d => d.id);

    // exit
    $datasets.exit()
      .remove();

    // enter
    const $$datasets = $datasets.enter()
      .append('div')
      .attr('class', 'rapid-catalog-dataset');

    const $$labels = $$datasets
      .append('div')
      .attr('class', 'rapid-catalog-dataset-label');

    $$labels
      .append('div')
      .attr('class', 'rapid-catalog-dataset-name');

    const $$link = $$labels
      .append('div')
      .attr('class', 'rapid-catalog-dataset-license')
      .append('a')
      .attr('class', 'rapid-catalog-dataset-link')
      .attr('target', '_blank')
      .attr('href', d => d.itemURL);

    $$link
      .append('span')
      .attr('class', 'rapid-catalog-dataset-link-text');

    $$link
      .call(uiIcon('#rapid-icon-out-link', 'inline'));

    const $$featured = $$labels.selectAll('.rapid-catalog-dataset-featured')
      .data(d => d.groupCategories.filter(d => d.toLowerCase() === '/categories/featured'))
      .enter()
      .append('div')
      .attr('class', 'rapid-catalog-dataset-featured');

    $$featured
      .append('span')
      .text('\u2b50');  // emoji star

    $$featured
      .append('span')
      .attr('class', 'rapid-catalog-dataset-featured-text');

    $$labels.selectAll('.rapid-catalog-dataset-beta')
      .data(d => d.groupCategories.filter(d => d.toLowerCase() === '/categories/preview'))
      .enter()
      .append('div')
      .attr('class', 'rapid-catalog-dataset-beta beta');

    $$labels
      .append('div')
      .attr('class', 'rapid-catalog-dataset-snippet');

    $$labels
      .append('button')
      .attr('class', 'rapid-catalog-dataset-action')
      .on('click', this.toggleDataset);

    const $$thumbnails = $$datasets
      .append('div')
      .attr('class', 'rapid-catalog-dataset-thumb');

    $$thumbnails
      .append('img')
      .attr('class', 'rapid-catalog-dataset-thumbnail')
      .attr('src', d => `https://openstreetmap.maps.arcgis.com/sharing/rest/content/items/${d.id}/info/${d.thumbnail}?w=400`);

    // update
    $datasets = $datasets.merge($$datasets)
      .sort(this.sortDatasets)
      .classed('hide', d => d.filtered);

    $datasets.selectAll('.rapid-catalog-dataset-name')
      .html(d => this.highlight(this._filterText, d.title));

    $datasets.selectAll('.rapid-catalog-dataset-link-text')
      .text(l10n.t('rapid_feature_toggle.esri.more_info'));

    $datasets.selectAll('.rapid-catalog-dataset-featured-text')
      .text(l10n.t('rapid_feature_toggle.esri.featured'));

    $datasets.selectAll('.rapid-catalog-dataset-beta')
      .attr('title', l10n.t('rapid_poweruser_features.beta'));

    $datasets.selectAll('.rapid-catalog-dataset-snippet')
      .html(d => this.highlight(this._filterText, d.snippet));

    $datasets.selectAll('.rapid-catalog-dataset-action')
      .classed('secondary', d => this.isDatasetAdded(d))
      .text(d => this.isDatasetAdded(d) ? l10n.t('rapid_feature_toggle.esri.remove') : l10n.t('rapid_feature_toggle.esri.add_to_map'));

    // update the count
    const numShown = this._datasetInfo.filter(d => !d.filtered).length;
    const gt = (count > MAXRESULTS && numShown === MAXRESULTS) ? '>' : '';
    $content.selectAll('.rapid-catalog-filter-results')
      .text(l10n.t('rapid_feature_toggle.esri.datasets_found', { num: `${gt}${numShown}` }));
  }


  /**
   * sortDatasets
   * Added datasets to the beginning
   * Featured datasets next
   * All others sort by name
   */
  sortDatasets(a, b) {
    const aAdded = this.isDatasetAdded(a);
    const bAdded = this.isDatasetAdded(b);
    const aFeatured = a.groupCategories.some(d => d.toLowerCase() === '/categories/featured');
    const bFeatured = b.groupCategories.some(d => d.toLowerCase() === '/categories/featured');

    return aAdded && !bAdded ? -1
      : bAdded && !aAdded ? 1
      : aFeatured && !bFeatured ? -1
      : bFeatured && !aFeatured ? 1
      : a.title.localeCompare(b.title);
  }


  /**
   * toggleDataset
   * Toggles the given dataset between added/removed.
   * @param  {Event}  e? - triggering event (if any)
   * @param  {*}      d - bound datum (the dataset in this case)
   */
  toggleDataset(e, d) {
    const context = this.context;
    const gfx = context.systems.gfx;
    const rapid = context.systems.rapid;
    const urlhash = context.systems.urlhash;

    const datasets = rapid.datasets;
    const ds = datasets.get(d.id);

    if (ds) {
      ds.added = !ds.added;

    } else {  // hasn't been added yet
      const esri = context.services.esri;
      if (esri) {   // start fetching layer info (the mapping between attributes and tags)
        esri.loadLayerAsync(d.id);
      }

      const isBeta = d.groupCategories.some(cat => cat.toLowerCase() === '/categories/preview');
      const isBuildings = d.groupCategories.some(cat => cat.toLowerCase() === '/categories/buildings');

      // pick a new color
      const colors = rapid.colors;
      const colorIndex = datasets.size % colors.length;

      const dataset = new RapidDataset(context, {
        id: d.id,
        beta: isBeta,
        added: true,         // whether it should appear in the list
        enabled: true,       // whether the user has checked it on
        conflated: false,
        service: 'esri',
        color: colors[colorIndex],
        dataUsed: ['esri', esri.getDataUsed(d.title)],
        label: d.title,
        licenseUrl: 'https://wiki.openstreetmap.org/wiki/Esri/ArcGIS_Datasets#License'
      });

      if (d.extent) {
        dataset.extent = new Extent(d.extent[0], d.extent[1]);
      }

      // Experiment: run building layers through MapWithAI conflation service
      if (isBuildings) {
        dataset.conflated = true;
        dataset.service = 'mapwithai';

        // and disable the Microsoft buildings to avoid clutter
        const msBuildings = datasets.get('msBuildings');
        if (msBuildings) {
          msBuildings.enabled = false;
        }
      }

      datasets.set(dataset.id, dataset);
    }

    // update url hash
    const datasetIDs = [...rapid.datasets.values()]
      .filter(ds => ds.added && ds.enabled)
      .map(ds => ds.id)
      .join(',');

    urlhash.setParam('datasets', datasetIDs.length ? datasetIDs : null);

    this.render();

    context.enter('browse');   // return to browse mode (in case something was selected)
    gfx.immediateRedraw();
  }


  /**
   * isDatasetAdded
   * @param  {*}  d - bound datum (the dataset in this case)
   */
  isDatasetAdded(d) {
    const rapid = this.context.systems.rapid;
    const ds = rapid.datasets.get(d.id);
    return ds?.added;
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

