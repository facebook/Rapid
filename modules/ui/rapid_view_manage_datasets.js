import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import marked from 'marked';
import { t, localizer } from '../core/localizer';
import { prefs } from '../core/preferences';
import { geoExtent } from '../geo';
import { modeBrowse } from '../modes';
import { services } from '../services';
import { svgIcon } from '../svg/icon';
import { utilKeybinding, utilRebind, utilWrap } from '../util';


export function uiRapidViewManageDatasets(context, parentModal) {
  const rapidContext = context.rapidContext();
  const dispatch = d3_dispatch('done');
  const PERPAGE = 4;

  let _content = d3_select(null);
  let _datasetInfo;
  let _datasetStart = 0;
  let _myClose = () => true;   // custom close handler


  function clamp(num, min, max) {
    return Math.max(min, Math.min(num, max));
  }


  function clickPage(d) {
    if (!Array.isArray(_datasetInfo)) return;

    const pages = Math.ceil(_datasetInfo.length / PERPAGE);
    _datasetStart = clamp(d, 0, pages - 1) * PERPAGE;

    _content
      .call(renderModalContent);
  }


  function nextPreviousPage(d) {
    if (!Array.isArray(_datasetInfo)) return;

    const pages = Math.ceil(_datasetInfo.length / PERPAGE);
    const currPage = Math.floor(_datasetStart / PERPAGE);
    const nextPage = utilWrap(currPage + d, pages);
    _datasetStart = nextPage * PERPAGE;

    _content
      .call(renderModalContent);
  }


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

    line1
      .append('div')
      .attr('class', 'rapid-view-manage-header-inputs');
      // .text('Home / Search');

    let line2 = headerEnter
      .append('div');

    line2
      .append('div')
      .attr('class', 'rapid-view-manage-header-about')
      .html(marked(t('rapid_feature_toggle.esri.about')));

    line2.selectAll('a')
      .attr('target', '_blank');


    /* Pages section */
    let pagesSection = selection.selectAll('.rapid-view-manage-pages')
      .data([0]);

    let pagesSectionEnter = pagesSection.enter()
      .append('div')
      .attr('class', 'modal-section rapid-view-manage-pages');

    pagesSection = pagesSection
      .merge(pagesSectionEnter)
      .call(renderPages);


    /* Dataset section */
    let dsSection = selection.selectAll('.rapid-view-manage-datasets-section')
      .data([0]);

    // enter
    let dsSectionEnter = dsSection.enter()
      .append('div')
      .attr('class', 'modal-section rapid-view-manage-datasets-section');

    dsSectionEnter
      .append('div')
      .attr('class', 'rapid-view-manage-pageleft')
      .call(svgIcon(isRTL ? '#iD-icon-forward' : '#iD-icon-backward'))
      .on('click', () => nextPreviousPage(isRTL ? 1 : -1) );

    dsSectionEnter
      .append('div')
      .attr('class', 'rapid-view-manage-datasets');

    dsSectionEnter
      .append('div')
      .attr('class', 'rapid-view-manage-pageright')
      .call(svgIcon(isRTL ? '#iD-icon-backward' : '#iD-icon-forward'))
      .on('click', () => nextPreviousPage(isRTL ? -1 : 1) );

    // update
    dsSection = dsSection
      .merge(dsSectionEnter);

    dsSection.selectAll('.rapid-view-manage-datasets')
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
    const showPreview = prefs('rapid-internal-feature.previewDatasets') === 'true';
    const service = services.esriData;
    if (!service || (Array.isArray(_datasetInfo) && !_datasetInfo.length)) {
      selection.text(t('rapid_feature_toggle.esri.no_datasets'));
      return;
    }

    if (!_datasetInfo) {
      selection.text(t('rapid_feature_toggle.esri.fetching_datasets'));
      service.loadDatasets()
        .then(results => {
          // exclude preview datasets unless user has opted into them
          return _datasetInfo = Object.values(results)
            .filter(d => showPreview || !d.groupCategories.some(category => category === '/Categories/Preview'));
        })
        .then(() => _content.call(renderModalContent));
      return;
    }

    selection.text('');

    let page = _datasetInfo.slice(_datasetStart, _datasetStart + PERPAGE);
    let datasets = selection.selectAll('.rapid-view-manage-dataset')
      .data(page, d => d.id);

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
      .append('strong')
      .text(d => d.title);

    labelsEnter.selectAll('.rapid-view-manage-dataset-beta')
      .data(d => d.groupCategories.filter(d => d === '/Categories/Preview'))
      .enter()
      .append('div')
      .attr('class', 'rapid-view-manage-dataset-beta beta')
      .attr('title', t('rapid_poweruser_features.beta'));

    labelsEnter
      .append('div')
      .attr('class', 'rapid-view-manage-dataset-license')
      .append('a')
      .attr('class', 'rapid-view-manage-dataset-link')
      .attr('target', '_blank')
      .attr('href', d => d.itemURL)
      .text(t('rapid_feature_toggle.esri.more_info'))
      .call(svgIcon('#iD-icon-out-link', 'inline'));

    labelsEnter
      .append('div')
      .text(d => d.snippet);

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
      .merge(datasetsEnter);

    datasets.selectAll('.rapid-view-manage-dataset-action')
      .classed('secondary', d => datasetAdded(d))
      .text(d => datasetAdded(d) ? t('rapid_feature_toggle.esri.remove') : t('rapid_feature_toggle.esri.add_to_map'));
  }


  function renderPages(selection) {
    if (!_datasetInfo) return;

    const total = _datasetInfo.length;
    const numPages = Math.ceil(total / PERPAGE);
    const currPage = Math.floor(_datasetStart / PERPAGE);
    const pages = Array.from(Array(numPages).keys());

    let dots = selection.selectAll('.rapid-view-manage-page')
      .data(pages);

    // exit
    dots.exit()
      .remove();

    // enter/update
    dots.enter()
      .append('span')
      .attr('class', 'rapid-view-manage-page')
      .html('&#11044;')
      .on('click', clickPage)
      .merge(dots)
      .classed('current', d => d === currPage);
  }


  function toggleDataset(d, i, nodes) {
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

    nodes[i].blur();
    _content.call(renderModalContent);

    context.enter(modeBrowse(context));   // return to browse mode (in case something was selected)
    context.map().pan([0,0]);             // trigger a map redraw
  }


  function datasetAdded(d) {
    const datasets = rapidContext.datasets();
    return datasets[d.id] && datasets[d.id].added;
  }


  return utilRebind(render, dispatch, 'on');
}
