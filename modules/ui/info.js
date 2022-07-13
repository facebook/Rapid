import { select as d3_select } from 'd3-selection';

import { t } from '../core/localizer';
import { svgIcon } from '../svg/icon';
import { uiCmd } from './cmd';

import { UiPanelBackground } from './panels/UiPanelBackground';
import { uiPanelHistory } from './panels/history';
import { uiPanelLocation } from './panels/location';
import { uiPanelMeasurement } from './panels/measurement';


/**
 * uiInfo
 * This component acts as the container for the information panels.
 * "Panels" are user interface elements that can float on top of the map
 * and provide extra information about the map or the selection.
 */
export function uiInfo(context) {
  const panels = {
    background:   new UiPanelBackground(context),
    history:      uiPanelHistory(context),
    location:     uiPanelLocation(context),
    measurement:  uiPanelMeasurement(context)
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
          if (d === 'background') {
            panels[d].disable();
            selection.remove();  // empty DOM
          } else {
            selection
              .call(panels[d].off)
              .remove();
          }
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
        .html(d => panels[d].label);

      titleEnter
        .append('button')
        .attr('class', 'close')
        .on('click', (e, d) => {
          e.stopImmediatePropagation();
          e.preventDefault();
          info.toggle(d);
        })
        .call(svgIcon('#iD-icon-close'));

      panelEnter
        .append('div')
        .attr('class', d => `panel-content panel-content-${d}`)
        .each((d, i, nodes) => {
          if (d === 'background') {
            const selection = d3_select(nodes[i]);
            panels[d].enable(selection);
          }
        });


      // Render each panel's content
      infoPanels.selectAll('.panel-content')
        .each((d, i, nodes) => {
          if (d === 'background') {
            panels[d].render();
          } else {
            const selection = d3_select(nodes[i]);
            selection.call(panels[d]);
          }
        });
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
    context.keybinding()
      .on(uiCmd('⌘' + t('info_panels.key')), e => {
        e.stopImmediatePropagation();
        e.preventDefault();
        info.toggle();
      });

    // bind keys to show/hide individual panels
    panelIDs.forEach(k => {
      const key = t(`info_panels.${k}.key`, { default: null });
      if (!key) return;

      context.keybinding()
        .on(uiCmd('⌘⇧' + key), e => {
          e.stopImmediatePropagation();
          e.preventDefault();
          info.toggle(k);
        });
    });
  }

  return info;
}
