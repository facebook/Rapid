import { select as d3_select } from 'd3-selection';
import { utilStringQs } from '@id-sdk/util';
import _debounce from 'lodash-es/debounce';

import {
  uiToolRapidFeatures, uiToolDrawModes, uiToolNotes, uiToolSave,
  uiToolSidebarToggle, uiToolUndoRedo, uiToolDownloadOsc
} from './tools';


export function uiTopToolbar(context) {
  const sidebarToggle = uiToolSidebarToggle(context);
  const rapidFeatures = uiToolRapidFeatures(context);
  const modes = uiToolDrawModes(context);
  // const notes = uiToolNotes(context);
  const undoRedo = uiToolUndoRedo(context);
  const save = uiToolSave(context);
  const downloadOsc = uiToolDownloadOsc(context);


  function notesEnabled() {
    const layers = context.layers();
    const noteLayer = layers && layers.getLayer('notes');
    return noteLayer && noteLayer.enabled();
  }

  function topToolbar(selection) {
    // const debouncedUpdate = _debounce(update, 500, { leading: true, trailing: true });
    // context.layers()
    //     .on('change.topToolbar', debouncedUpdate);

    update();


    function update() {
      let tools = [sidebarToggle, 'spacer', modes, rapidFeatures];

      if (notesEnabled()) {
        tools.push('spacer', notes);
      }

      tools.push('spacer', undoRedo, save);

      const q = utilStringQs(window.location.hash);
      if (q.support_download_osc === 'true') {
        tools.push(downloadOsc);
      }

      let toolbarItems = selection.selectAll('.toolbar-item')
        .data(tools, d => d.id || d);

      // exit
      toolbarItems.exit()
        .each(d => {
          if (d.uninstall) d.uninstall();
        })
        .remove();

      // enter
      let itemsEnter = toolbarItems
        .enter()
        .append('div')
        .attr('class', d => {
          let classes = 'toolbar-item ' + (d.id || d).replace('_', '-');
          if (d.klass) classes += ' ' + d.klass;
          return classes;
        });

      let actionableEnter = itemsEnter
        .filter(d => d !== 'spacer');

      actionableEnter
        .append('div')
        .attr('class', 'item-content')
        .each((d, i, nodes) => {
          d3_select(nodes[i])
            .call(d.install, selection);
        });

      actionableEnter
        .append('div')
        .attr('class', 'item-label')
        .html(d => d.label);
    }

  }

  return topToolbar;
}
