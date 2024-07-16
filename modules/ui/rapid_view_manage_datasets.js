import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { Extent } from '@rapid-sdk/math';
import { marked } from 'marked';

import { uiIcon } from './icon.js';
import { uiCombobox} from './combobox.js';
import { utilKeybinding, utilNoAuto, utilRebind } from '../util/index.js';


export function uiRapidViewManageDatasets(context, parentModal) {
  const assets = context.systems.assets;
  const l10n = context.systems.l10n;
  const rapid = context.systems.rapid;
  const dispatch = d3_dispatch('done');
  const categoryCombo = uiCombobox(context, 'dataset-categories');
  const MAXRESULTS = 100;

  let _content = d3_select(null);
  let _filterText;
  let _filterCategory;
  let _datasetInfo;
  let _myClose = () => true;   // custom close handler


  function render() {
    // Unfortunately `uiModal` is written in a way that there can be only one at a time.
    // So we have to roll our own modal here instead of just creating a second `uiModal`.
    let shaded = context.container().selectAll('.shaded');  // container for the existing modal
    if (shaded.empty()) return;
    if (shaded.selectAll('.modal-view-manage').size()) return;  // view/manage modal exists already

    const origClose = parentModal.close;
    parentModal.close = () => { /* ignore */ };

    // override the close handler
    _myClose = () => {
      _filterText = null;
      _filterCategory = null;
      myModal
        .transition()
        .duration(200)
        .style('top', '0px')
        .on('end', () => myShaded.remove());

      parentModal.close = origClose;  // restore close handler

      let keybinding = utilKeybinding('modal');
      keybinding.on(['⌫', '⎋'], origClose);
      d3_select(document).call(keybinding);
      dispatch.call('done');
    };


    let keybinding = utilKeybinding('modal');
    keybinding.on(['⌫', '⎋'], _myClose);
    d3_select(document).call(keybinding);

    let myShaded = shaded
      .append('div')
      .attr('class', 'view-manage-wrap');  // need absolutely positioned div here for new stacking context

    let myModal = myShaded
      .append('div')
      .attr('class', 'modal rapid-modal modal-view-manage')  // Rapid styling
      .style('opacity', 0);

    myModal
      .append('button')
      .attr('class', 'close')
      .on('click', _myClose)
      .call(uiIcon('#rapid-icon-close'));

    _content = myModal
      .append('div')
      .attr('class', 'rapid-stack content');

    _content
      .call(renderModalContent);

    _content.selectAll('.ok-button')
      .node()
      .focus();

    myModal
      .transition()
      .style('opacity', 1);
  }


  function renderModalContent(selection) {
    /* Header section */
    let headerEnter = selection.selectAll('.rapid-view-manage-header')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'modal-section rapid-view-manage-header');

    let line1 = headerEnter
      .append('div');

    line1
      .append('div')
      .attr('class', 'rapid-view-manage-header-icon')
      .call(uiIcon('#rapid-icon-data', 'icon-30'));

    line1
      .append('div')
      .attr('class', 'rapid-view-manage-header-text')
      .text(l10n.t('rapid_feature_toggle.esri.title'));

    let line2 = headerEnter
      .append('div');

    line2
      .append('div')
      .attr('class', 'rapid-view-manage-header-about')
      .html(marked.parse(l10n.t('rapid_feature_toggle.esri.about')));

    line2.selectAll('a')
      .attr('target', '_blank');


    /* Filter section */
    let filterEnter = selection.selectAll('.rapid-view-manage-filter')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'modal-section rapid-view-manage-filter');


    let filterSearchEnter = filterEnter
      .append('div')
      .attr('class', 'rapid-view-manage-filter-search-wrap');

    filterSearchEnter
      .call(uiIcon('#fas-filter', 'inline'));

    filterSearchEnter
      .append('input')
      .attr('class', 'rapid-view-manage-filter-search')
      .attr('placeholder', l10n.t('rapid_feature_toggle.esri.filter_datasets'))
      .call(utilNoAuto)
      .on('input', d3_event => {
        const element = d3_event.currentTarget;
        const val = (element && element.value) || '';
        _filterText = val.trim().toLowerCase();
        dsSection.call(renderDatasets);
      });


    let filterTypeEnter = filterEnter
      .append('div')
      .attr('class', 'rapid-view-manage-filter-type-wrap');

    filterTypeEnter
      .append('input')
      .attr('class', 'rapid-view-manage-filter-type')
      .attr('placeholder', l10n.t('rapid_feature_toggle.esri.any_type'))
      .call(utilNoAuto)
      .call(categoryCombo)
      .on('blur change', d3_event => {
        const element = d3_event.currentTarget;
        const val = (element && element.value) || '';
        const data = categoryCombo.data();
        if (data.some(item => item.value === val)) {  // only allow picking values from the list
          _filterCategory = val;
        } else {
          d3_event.currentTarget.value = '';
          _filterCategory = null;
        }
        dsSection.call(renderDatasets);
      });

    filterEnter
      .append('div')
      .attr('class', 'rapid-view-manage-filter-clear')
      .append('a')
      .attr('href', '#')
      .text(l10n.t('rapid_feature_toggle.esri.clear_filters'))
      .on('click', d3_event => {
        d3_event.preventDefault();
        const element = d3_event.currentTarget;
        element.blur();
        selection.selectAll('input').property('value', '');
        _filterText = null;
        _filterCategory = null;
        dsSection.call(renderDatasets);
      });

    filterEnter
      .append('div')
      .attr('class', 'rapid-view-manage-filter-results');


    /* Dataset section */
    let dsSection = selection.selectAll('.rapid-view-manage-datasets-section')
      .data([0]);

    // enter
    let dsSectionEnter = dsSection.enter()
      .append('div')
      .attr('class', 'modal-section rapid-view-manage-datasets-section');

    dsSectionEnter
      .append('div')
      .attr('class', 'rapid-view-manage-datasets-status');

    dsSectionEnter
      .append('div')
      .attr('class', 'rapid-view-manage-datasets');

    // update
    dsSection = dsSection
      .merge(dsSectionEnter)
      .call(renderDatasets);


    /* OK Button */
    let buttonsEnter = selection.selectAll('.modal-section.buttons')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'modal-section buttons');

    buttonsEnter
      .append('button')
      .attr('class', 'button ok-button action')
      .on('click', _myClose)
      .text(l10n.t('confirm.okay'));
  }


  function renderDatasets(selection) {
    const status = selection.selectAll('.rapid-view-manage-datasets-status');
    const results = selection.selectAll('.rapid-view-manage-datasets');

    const prefs = context.systems.storage;
    const showPreview = prefs.getItem('rapid-internal-feature.previewDatasets') === 'true';
    const esri = context.services.esri;

    if (!esri || (Array.isArray(_datasetInfo) && !_datasetInfo.length)) {
      results.classed('hide', true);
      status.classed('hide', false).text(l10n.t('rapid_feature_toggle.esri.no_datasets'));
      return;
    }

    if (!_datasetInfo) {
      results.classed('hide', true);
      status.classed('hide', false)
        .text(l10n.t('rapid_feature_toggle.esri.fetching_datasets'));

      status
        .append('br');

      status
        .append('img')
        .attr('class', 'rapid-view-manage-datasets-spinner')
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
            if (c === 'preview') item.display = `${c} <span class="rapid-view-manage-dataset-beta beta"></span>`;
            return item;
          });
          categoryCombo.data(combodata);

          // Exclude preview datasets unless user has opted into them
          _datasetInfo = Object.values(results)
            .filter(d => showPreview || !d.groupCategories.some(category => category.toLowerCase() === '/categories/preview'));

          return _datasetInfo;
        })
        .then(() => _content.call(renderModalContent));

      return;
    }

    results.classed('hide', false);
    status.classed('hide', true);

    // Apply filters
    let count = 0;
    _datasetInfo.forEach(d => {
      const title = (d.title || '').toLowerCase();
      const snippet = (d.snippet || '').toLowerCase();

      if (datasetAdded(d)) {  // always show added datasets at the top of the list
        d.filtered = false;
        ++count;
        return;
      }
      if (_filterText && title.indexOf(_filterText) === -1 && snippet.indexOf(_filterText) === -1) {
        d.filtered = true;   // filterText not found anywhere in `title` or `snippet`
        return;
      }
      if (_filterCategory && !(d.groupCategories.some(category => category.toLowerCase() === `/categories/${_filterCategory}`))) {
        d.filtered = true;   // filterCategory not found anywhere in `groupCategories``
        return;
      }

      d.filtered = (++count > MAXRESULTS);
    });


    let datasets = results.selectAll('.rapid-view-manage-dataset')
      .data(_datasetInfo, d => d.id);

    // exit
    datasets.exit()
      .remove();

    // enter
    let datasetsEnter = datasets.enter()
      .append('div')
      .attr('class', 'rapid-view-manage-dataset');

    let labelsEnter = datasetsEnter
      .append('div')
      .attr('class', 'rapid-view-manage-dataset-label');

    labelsEnter
      .append('div')
      .attr('class', 'rapid-view-manage-dataset-name');

    labelsEnter
      .append('div')
      .attr('class', 'rapid-view-manage-dataset-license')
      .append('a')
      .attr('class', 'rapid-view-manage-dataset-link')
      .attr('target', '_blank')
      .attr('href', d => d.itemURL)
      .text(l10n.t('rapid_feature_toggle.esri.more_info'))
      .call(uiIcon('#rapid-icon-out-link', 'inline'));

    let featuredEnter = labelsEnter.selectAll('.rapid-view-manage-dataset-featured')
      .data(d => d.groupCategories.filter(d => d.toLowerCase() === '/categories/featured'))
      .enter()
      .append('div')
      .attr('class', 'rapid-view-manage-dataset-featured');

    featuredEnter
      .append('span')
      .text('\u2b50');

    featuredEnter
      .append('span')
      .text(l10n.t('rapid_feature_toggle.esri.featured'));

    labelsEnter.selectAll('.rapid-view-manage-dataset-beta')
      .data(d => d.groupCategories.filter(d => d.toLowerCase() === '/categories/preview'))
      .enter()
      .append('div')
      .attr('class', 'rapid-view-manage-dataset-beta beta')
      .attr('title', l10n.t('rapid_poweruser_features.beta'));

    labelsEnter
      .append('div')
      .attr('class', 'rapid-view-manage-dataset-snippet');

    labelsEnter
      .append('button')
      .attr('class', 'rapid-view-manage-dataset-action')
      .on('click', toggleDataset);

    let thumbsEnter = datasetsEnter
      .append('div')
      .attr('class', 'rapid-view-manage-dataset-thumb');

    thumbsEnter
      .append('img')
      .attr('class', 'rapid-view-manage-dataset-thumbnail')
      .attr('src', d => `https://openstreetmap.maps.arcgis.com/sharing/rest/content/items/${d.id}/info/${d.thumbnail}?w=400`);

    // update
    datasets = datasets
      .merge(datasetsEnter)
      .sort(sortDatasets)
      .classed('hide', d => d.filtered);

    datasets.selectAll('.rapid-view-manage-dataset-name')
      .html(d => highlight(_filterText, d.title));

    datasets.selectAll('.rapid-view-manage-dataset-snippet')
      .html(d => highlight(_filterText, d.snippet));

    datasets.selectAll('.rapid-view-manage-dataset-action')
      .classed('secondary', d => datasetAdded(d))
      .text(d => datasetAdded(d) ? l10n.t('rapid_feature_toggle.esri.remove') : l10n.t('rapid_feature_toggle.esri.add_to_map'));

    const numShown = _datasetInfo.filter(d => !d.filtered).length;
    const gt = (count > MAXRESULTS && numShown === MAXRESULTS) ? '>' : '';
    _content.selectAll('.rapid-view-manage-filter-results')
      .text(l10n.t('rapid_feature_toggle.esri.datasets_found', { num: `${gt}${numShown}` }));
  }


  // Sort:
  // Added datasets to the beginning
  // Featured datasets next
  // All others sort by name
  function sortDatasets(a, b) {
    const aAdded = datasetAdded(a);
    const bAdded = datasetAdded(b);
    const aFeatured = a.groupCategories.some(d => d.toLowerCase() === '/categories/featured');
    const bFeatured = b.groupCategories.some(d => d.toLowerCase() === '/categories/featured');

    return aAdded && !bAdded ? -1
      : bAdded && !aAdded ? 1
      : aFeatured && !bFeatured ? -1
      : bFeatured && !aFeatured ? 1
      : a.title.localeCompare(b.title);
  }


  function toggleDataset(d3_event, d) {
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

      const dataset = {
        id: d.id,
        beta: isBeta,
        added: true,         // whether it should appear in the list
        enabled: true,       // whether the user has checked it on
        conflated: false,
        service: 'esri',
        color: colors[colorIndex],
        dataUsed: ['esri', d.title],
        label: d.title,
        license_markdown: l10n.t('rapid_feature_toggle.esri.license_markdown')
      };

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

      datasets.set(d.id, dataset);
    }

    // update url hash
    const urlhash = context.systems.urlhash;
    const datasetIDs = [...rapid.datasets.values()]
      .filter(ds => ds.added && ds.enabled)
      .map(ds => ds.id)
      .join(',');
    urlhash.setParam('datasets', datasetIDs.length ? datasetIDs : null);

    _content.call(renderModalContent);

    context.enter('browse');   // return to browse mode (in case something was selected)
    context.systems.map.immediateRedraw();
  }


  function datasetAdded(d) {
    const ds = rapid.datasets.get(d.id);
    return ds?.added;
  }


  function highlight(needle, haystack) {
    let html = haystack;
    if (needle) {
      const re = new RegExp('\(' + escapeRegex(needle) + '\)', 'gi');
      html = html.replace(re, '<mark>$1</mark>');
    }
    return html;
  }

  function escapeRegex(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  }

  return utilRebind(render, dispatch, 'on');
}
