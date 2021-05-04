import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import marked from 'marked';
import { t, localizer } from '../core/localizer';
import { prefs } from '../core/preferences';
import { geoExtent } from '../geo';
import { modeBrowse } from '../modes';
import { services } from '../services';
import { svgIcon } from '../svg/icon';
import { utilKeybinding, utilNoAuto, utilRebind, utilWrap } from '../util';


export function uiRapidViewManageDatasets(context, parentModal) {
  const rapidContext = context.rapidContext();
  const dispatch = d3_dispatch('done');

  let _content = d3_select(null);
  let _filter;
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
      _filter = null;
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
      .attr('class', 'modal rapid-modal modal-view-manage')  // RapiD styling
      .style('opacity', 0);

    myModal
      .append('button')
      .attr('class', 'close')
      .on('click', _myClose)
      .call(svgIcon('#iD-icon-close'));

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
    const isRTL = localizer.textDirection() === 'rtl';

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
      .call(svgIcon('#iD-icon-data', 'icon-30'));

    line1
      .append('div')
      .attr('class', 'rapid-view-manage-header-text')
      .text(t('rapid_feature_toggle.esri.title'));

    let line2 = headerEnter
      .append('div');

    line2
      .append('div')
      .attr('class', 'rapid-view-manage-header-about')
      .html(marked(t('rapid_feature_toggle.esri.about')));

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
      .call(svgIcon('#fas-filter', 'inline'));

    filterSearchEnter
      .append('input')
      .attr('class', 'rapid-view-manage-filter-search')
      .attr('placeholder', 'filter datasets')
      .call(utilNoAuto)
      .on('input', (d3_event) => {
        const target = d3_event.target;
        const val = (target && target.value) || '';
        _filter = val.trim().toLowerCase();
        dsSection
          .call(renderDatasets);
      });


    let filterTypeEnter = filterEnter
      .append('div')
      .attr('class', 'rapid-view-manage-filter-type-wrap');

    filterTypeEnter
      .append('input')
      .attr('class', 'rapid-view-manage-filter-type')
      .attr('placeholder', 'any type')
      .call(utilNoAuto)
      .on('input', (d3_event) => {
        // const target = d3_event.target;
        // const val = (target && target.value) || '';
        // _filter = val.trim().toLowerCase();
        // dsSection
        //   .call(renderDatasets);
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
      .text(t('confirm.okay'));
  }


  function renderDatasets(selection) {
    const status = selection.selectAll('.rapid-view-manage-datasets-status');
    const results = selection.selectAll('.rapid-view-manage-datasets');

    const showPreview = prefs('rapid-internal-feature.previewDatasets') === 'true';
    const service = services.esriData;

    if (!service || (Array.isArray(_datasetInfo) && !_datasetInfo.length)) {
      results.classed('hide', true);
      status.classed('hide', false).text(t('rapid_feature_toggle.esri.no_datasets'));
      return;
    }

    if (!_datasetInfo) {
      results.classed('hide', true);
      status.classed('hide', false)
        .text(t('rapid_feature_toggle.esri.fetching_datasets'));

      status
        .append('br');

      status
        .append('img')
        .attr('class', 'rapid-view-manage-datasets-spinner')
        .attr('src', context.imagePath('loader-black.gif'));

      service.loadDatasets()
        .then(results => {
          // exclude preview datasets unless user has opted into them
          return _datasetInfo = Object.values(results)
            .filter(d => showPreview || !d.groupCategories.some(category => category === '/Categories/Preview'));
        })
        .then(() => _content.call(renderModalContent));
      return;
    }

    results.classed('hide', false);
    status.classed('hide', true);

    // apply filter
    _datasetInfo.forEach(d => {
      if (!_filter) {
        d.filtered = false;
        return;
      }
      const title = (d.title || '').toLowerCase();
      if (title.indexOf(_filter) !== -1)  {
        d.filtered = false;
        return;
      }
      const snippet = (d.snippet || '').toLowerCase();
      if (snippet.indexOf(_filter) !== -1) {
        d.filtered = false;
        return;
      }
      d.filtered = true;
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
      .text(t('rapid_feature_toggle.esri.more_info'))
      .call(svgIcon('#iD-icon-out-link', 'inline'));

    labelsEnter.selectAll('.rapid-view-manage-dataset-beta')
      .data(d => d.groupCategories.filter(d => d === '/Categories/Preview'))
      .enter()
      .append('div')
      .attr('class', 'rapid-view-manage-dataset-beta beta')
      .attr('title', t('rapid_poweruser_features.beta'));

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
      .classed('hide', d => d.filtered);

    datasets.selectAll('.rapid-view-manage-dataset-name')
      .html(d => highlight(_filter, d.title));

    datasets.selectAll('.rapid-view-manage-dataset-snippet')
      .html(d => highlight(_filter, d.snippet));

    datasets.selectAll('.rapid-view-manage-dataset-action')
      .classed('secondary', d => datasetAdded(d))
      .text(d => datasetAdded(d) ? t('rapid_feature_toggle.esri.remove') : t('rapid_feature_toggle.esri.add_to_map'));

    const count = _datasetInfo.filter(d => !d.filtered).length;
    _content.selectAll('.rapid-view-manage-filter-results')
      .text(`${count} dataset(s) found`);
  }


  function toggleDataset(d3_event, d) {
    const datasets = rapidContext.datasets();
    const ds = datasets[d.id];

    if (ds) {
      ds.added = !ds.added;

    } else {  // hasn't been added yet
      const isBeta = d.groupCategories.some(d => d === '/Categories/Preview');
      const isBuildings = d.groupCategories.some(d => d === '/Categories/Buildings');

      // pick a new color
      const colors = rapidContext.colors();
      const colorIndex = Object.keys(datasets).length % colors.length;

      let dataset = {
        id: d.id,
        beta: isBeta,
        added: true,         // whether it should appear in the list
        enabled: true,       // whether the user has checked it on
        conflated: false,
        service: 'esri',
        color: colors[colorIndex],
        label: d.title,
        license_markdown: t('rapid_feature_toggle.esri.license_markdown')
      };

      if (d.extent) {
        dataset.extent = geoExtent(d.extent);
      }

      // Test running building layers only through conflation service
      if (isBuildings) {
        dataset.conflated = true;
        dataset.service = 'fbml';
      }

      datasets[d.id] = dataset;
    }

    _content.call(renderModalContent);

    context.enter(modeBrowse(context));   // return to browse mode (in case something was selected)
    context.map().pan([0,0]);             // trigger a map redraw
  }


  function datasetAdded(d) {
    const datasets = rapidContext.datasets();
    return datasets[d.id] && datasets[d.id].added;
  }


  function highlight(needle, haystack) {
    let html = haystack;// escape(haystack);   // text -> html
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
