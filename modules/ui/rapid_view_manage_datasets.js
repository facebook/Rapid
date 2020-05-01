import { select as d3_select } from 'd3-selection';
import { json as d3_json } from 'd3-fetch';

import { t, textDirection } from '../util/locale';

import { svgIcon } from '../svg/icon';
import { utilKeybinding } from '../util';

let _datasetInfo;

export function uiRapidViewManageDatasets(context, parentModal) {
  let _content = d3_select(null);


  return function render() {
    // Unfortunately `uiModal` is written in a way that there can be only one at a time.
    // So we have to roll our own modal here instead of just creating a second `uiModal`.
    let shaded = context.container().selectAll('.shaded');  // container for the existing modal
    if (shaded.empty()) return;
    if (shaded.selectAll('.modal-view-manage').size()) return;  // view/manage modal exists already

    const origClose = parentModal.close;
    parentModal.close = () => { /* ignore */ };

    let myClose = () => {
      myModal
        .transition()
        .duration(200)
        .style('top','0px')
        .remove();

      parentModal.close = origClose;  // restore close handler

      let keybinding = utilKeybinding('modal');
      keybinding.on(['⌫', '⎋'], origClose);
      d3_select(document).call(keybinding);
    };

    let keybinding = utilKeybinding('modal');
    keybinding.on(['⌫', '⎋'], myClose);
    d3_select(document).call(keybinding);

    let myModal = shaded
      .append('div')
      .attr('class', 'modal modal-splash modal-rapid modal-view-manage fillL')
      .style('opacity', 0);

    myModal
      .append('button')
      .attr('class', 'close')
      .on('click', myClose)
      .call(svgIcon('#iD-icon-close'));

    _content = myModal
      .append('div')
      .attr('class', 'content rapid-feature rapid-stack fillL');

    _content
      .call(renderModalContent);

    myModal
      .transition()
      .style('opacity', 1);
  };


  function renderModalContent(selection) {
    /* Header section */
    let headerEnter = selection.selectAll('.rapid-view-manage-header')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'modal-section rapid-view-manage-header');

    headerEnter
      .append('div')
      .attr('class', 'rapid-view-manage-header-icon')
      .call(svgIcon('#iD-icon-data', 'icon-30'));

    headerEnter
      .append('div')
      .attr('class', 'rapid-view-manage-header-text')
      .text('ArcGIS Datasets');

    headerEnter
      .append('div')
      .attr('class', 'rapid-view-manage-header-inputs')
      .text('Home / Search');


    /* Dataset section */
    let dsSection = selection.selectAll('.rapid-view-manage-datasets')
      .data([0]);

    // enter
    let dsSectionEnter = dsSection.enter()
      .append('div')
      .attr('class', 'modal-section rapid-view-manage-datasets')
      .text('loading datasets...');

    // update
    dsSection
      .merge(dsSectionEnter)
      .call(renderDatasets);
  }


  function renderDatasets(selection) {
    if (!_datasetInfo) {
      fetchDatasets()
        .then(() => {
          selection
            .text('')    // remove loading message
            .call(renderDatasets);
        });
      return;
    }

    let datasets = selection.selectAll('.rapid-view-manage-dataset')
      .data(_datasetInfo, d => d.id);

    // enter
    let datasetsEnter = datasets.enter()
      .append('div')
      .attr('class', 'rapid-view-manage-dataset');

    datasetsEnter
      .append('div')
      .append('strong')
      .text(d => d.title);

    datasetsEnter
      .append('div')
      .text(d => d.snippet);

    datasetsEnter
      .append('div')
      .text(d => d.thumbnail);
  }


  function fetchDatasets() {
    const GROUPID = 'bdf6c800b3ae453b9db239e03d7c1727';
    const APIROOT = 'https://openstreetmap.maps.arcgis.com/sharing/rest/content';
    const url = `${APIROOT}/groups/${GROUPID}/search?num=20&start=1&sortField=title&sortOrder=asc&f=json`;

    return d3_json(url)
      .then(json => _datasetInfo = json.results)
      .catch(() => _datasetInfo = []);
    }

}
