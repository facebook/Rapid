import { select as d3_select } from 'd3-selection';

import { uiIcon } from './icon.js';
import { uiCmd } from './cmd.js';

import { UiPanelBackground } from './panels/UiPanelBackground.js';
import { UiPanelHistory } from './panels/UiPanelHistory.js';
import { UiPanelLocation } from './panels/UiPanelLocation.js';
import { UiPanelMeasurement } from './panels/UiPanelMeasurement.js';


/**
 * uiInfo
 * This component acts as the container for the information panels.
 * "Panels" are user interface elements that can float on top of the map
 * and provide extra information about the map or the selection.
 */
export function uiInfo(context) {
  const l10n = context.systems.l10n;
  const panels = {
    background:   new UiPanelBackground(context),
    history:      new UiPanelHistory(context),
    location:     new UiPanelLocation(context),
    measurement:  new UiPanelMeasurement(context)
  };

  const panelIDs = Object.keys(panels);

  let activeIDs = new Set();
  let wasActiveIDs = new Set();


  function info(selection) {

    function render() {
      let panelContainer = infoPanels.selectAll('.panel-container')
        .data(Array.from(activeIDs), d => d);

      panelContainer.exit()
        .style('opacity', 1)
        .transition()
        .duration(200)
        .style('opacity', 0)
        .on('end', (d, i, nodes) => {
          const selection = d3_select(nodes[i]);
          panels[d].disable();
          selection.remove();  // empty DOM
        });

      let panelEnter = panelContainer.enter()
        .append('div')
        .attr('class', d => `fillD2 panel-container panel-container-${d}`);

      panelEnter
        .style('opacity', 0)
        .transition()
        .duration(200)
        .style('opacity', 1);

      let titleEnter = panelEnter
        .append('div')
        .attr('class', 'panel-title fillD2');

      titleEnter
        .append('h3')
        .text(d => panels[d].title);

      titleEnter
        .append('button')
        .attr('class', 'close')
        .on('click', (e, d) => {
          e.stopImmediatePropagation();
          e.preventDefault();
          info.toggle(d);
        })
        .call(uiIcon('#rapid-icon-close'));

      panelEnter
        .append('div')
        .attr('class', d => `panel-content panel-content-${d}`)
        .each((d, i, nodes) => {
          const selection = d3_select(nodes[i]);
          panels[d].enable(selection);
        });


      // Render each panel's content
      infoPanels.selectAll('.panel-content')
        .each(d => panels[d].render());
    }


    info.toggle = function(panelID) {
      if (panelID) {   // toggle one
        if (activeIDs.has(panelID)) {   // panel is active, disable it
          activeIDs.delete(panelID);
          if (wasActiveIDs.size > 1) {   // leave at least 1 in wasActiveIDs
            wasActiveIDs.delete(panelID);
          }
        } else {                       // panel not active, enable it
          activeIDs.add(panelID);
          wasActiveIDs.add(panelID);
        }

      } else {      // toggle all
        if (activeIDs.size) {   // disable all
          activeIDs.clear();
        } else {                // enable whatever was active before (or 'measurement')
          if (!wasActiveIDs.size) {
            wasActiveIDs.add('measurement');
          }
          activeIDs = new Set(wasActiveIDs);
        }
      }

      // Update state of checkboxes scattered around the app in random places
      panelIDs.forEach(id => {
        context.container().selectAll(`.${id}-panel-toggle-item`)
          .classed('active', activeIDs.has(id))
          .select('input')
          .property('checked', activeIDs.has(id));
      });

      render();
    };


    // Bootstrap/setup code follows
    let infoPanels = selection.selectAll('.info-panels')
      .data([0]);

    infoPanels = infoPanels.enter()
      .append('div')
      .attr('class', 'info-panels')
      .merge(infoPanels);

    render();

    // bind ⌘I to show/hide all panels
    const keyAll = uiCmd('⌘' + l10n.t('info_panels.key'));
    context.keybinding().off(keyAll);
    context.keybinding().on(keyAll, e => {
      e.stopImmediatePropagation();
      e.preventDefault();
      info.toggle();
    });

    // bind keys to show/hide individual panels
    panelIDs.forEach(k => {
      const key = l10n.t(`info_panels.${k}.key`, { default: null });
      if (!key) return;

      const keyOne = uiCmd('⌘⇧' + key);
      context.keybinding().off(keyOne);
      context.keybinding().on(keyOne, e => {
        e.stopImmediatePropagation();
        e.preventDefault();
        info.toggle(k);
      });
    });
  }

  return info;
}
