import { descending as d3_descending, ascending as d3_ascending } from 'd3-array';
import { select as d3_select } from 'd3-selection';
import { easeCubicInOut as d3_easeCubicInOut } from 'd3-ease';
import { numWrap } from '@rapid-sdk/math';
import debounce from 'lodash-es/debounce.js';

import { uiTooltip } from '../tooltip.js';
import { ImagerySource } from '../../core/lib/index.js';
import { uiIcon } from '../icon.js';
import { uiCmd } from '../cmd.js';
import { uiSettingsCustomBackground } from '../settings/custom_background.js';
import { uiMapInMap } from '../map_in_map.js';
import { uiMap3dViewer } from '../map3d_viewer.js';
import { uiSection } from '../section.js';


export function uiSectionBackgroundList(context) {
  const imagery = context.systems.imagery;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const storage = context.systems.storage;

  const section = uiSection(context, 'background-list')
    .label(l10n.t('background.backgrounds'))
    .disclosureContent(render);

  let _backgroundList = d3_select(null);

  const customSource = imagery.getSource('custom');
  const settingsCustomBackground = uiSettingsCustomBackground(context)
    .on('change', customChanged);

  const stored = JSON.parse(storage.getItem('background-favorites')) || [];
  // note: older versions stored favorites as an object, but we only need the keys of this object
  const vals = Array.isArray(stored) ? stored : Object.keys(stored);
  const _favoriteIDs = new Set(vals);


  function previousBackgroundID() {
    return storage.getItem('background-last-used-toggle');
  }

  function isNotOverlay(d) {
    return !d.overlay;
  }


  /* renderIfVisible
   * This calls render on the Disclosure commponent.
   * It skips actual rendering if the disclosure is closed
   */
  function renderIfVisible() {
    section.reRender();
  }


  /* render
   * Render the background list and the checkboxes below it
   */
  function render(selection) {
    // the main background list
    const container = selection.selectAll('.layer-background-list')
      .data([0]);

    _backgroundList = container.enter()
      .append('ul')
      .attr('class', 'layer-list layer-background-list')
      .attr('dir', 'auto')
      .merge(container);

    // extra checkboxes below the list
    const extrasListEnter = selection.selectAll('.bg-extras-list')
      .data([0])
      .enter()
      .append('ul')
      .attr('class', 'layer-list bg-extras-list');

//    const wayBackImageryEnter = extrasListEnter
//      .append('li')
//      .attr('class', 'background.wayback.tooltip')
//      .append('div')
//      .style('display', 'flex');
//
//    const label = wayBackImageryEnter
//      .append('label')
//      .call(uiTooltip(context)
//        .title(l10n.t('background.wayback.tooltip'))
//        .placement('top')
//      );
//
//    label
//      .append('input')
//      .attr('type', 'checkbox')
//      .on('change', updateWaybackDates);
//
//
//    function updateWaybackDates() {
//      const checkbox = d3_select('input[type="checkbox"]');
//      const isChecked = checkbox.property('checked');
//
//      dropdown.style('display', isChecked ? 'block' : 'none');
//
//      if (isChecked) {
//        imagery.getWaybackSource().then(sourceMap => {
//          const sources = Array.from(sourceMap.sources.values());
//          const dates = sources.map(source => {
//            const date = source.id.split('_')[1];
//            return { value: date };
//          });
//          dates.sort((a, b) => b.value.localeCompare(a.value));
//          dates.forEach(date => {
//            dropdown.append('option').text(date.value);
//          });
//          dropdown.node().dispatchEvent(new Event('change'));
//        });
//      } else {
//        dropdown.selectAll('option').remove();
//        const defaultSource = imagery.chooseDefaultSource();
//        imagery.baseLayerSource(defaultSource);
//      }
//    }
//
//    map.on('zoom', updateWaybackDates);
//
//    function handleDropdownChange(d3_event) {
//      const selectedDate = d3_event.target.value;
//      imagery.getWaybackSource().then(sourceMap => {
//        // Find the sourceId that corresponds to the selected date
//        const sourceId = Array.from(sourceMap.sources.entries())
//          .find(([_, source]) => source.id.split('_')[1] === selectedDate)[0];
//        const imagerySource = sourceMap.sources.get(sourceId);
//        imagery.baseLayerSource(imagerySource);
//      });
//    }
//
//    const dropdown = wayBackImageryEnter
//      .append('select')
//      .style('display', 'none')
//      .style('vertical-align', 'middle')
//      .style('height', '20px')
//      .style('width', '120px')
//      .style('margin', 'auto')
//      .style('cursor', 'pointer')
//      .on('change', handleDropdownChange);
//
//    label
//      .append('span')
//      .text(l10n.t('background.wayback.title'));

    const minimapLabelEnter = extrasListEnter
      .append('li')
      .attr('class', 'minimap-toggle-item')
      .append('label')
      .call(uiTooltip(context)
        .title(l10n.t('background.minimap.tooltip'))
        .shortcut(l10n.t('background.minimap.key'))
        .placement('top')
      );

    minimapLabelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', d3_event => {
        d3_event.preventDefault();
        uiMapInMap.toggle();
      });

    minimapLabelEnter
      .append('span')
      .text(l10n.t('background.minimap.description'));


    const threeDmapLabelEnter = extrasListEnter
      .append('li')
      .attr('class', 'three-d-map-toggle-item')
      .append('label')
      .call(uiTooltip(context)
        .title(l10n.t('background.3dmap.tooltip'))
        .shortcut(uiCmd('⌘' + l10n.t('background.3dmap.key')))
        .placement('top')
      );

    threeDmapLabelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', d3_event => {
        d3_event.preventDefault();
        uiMap3dViewer.toggle();
      });

    threeDmapLabelEnter
      .append('span')
      .text(l10n.t('background.3dmap.description'));


    const panelLabelEnter = extrasListEnter
      .append('li')
      .attr('class', 'background-panel-toggle-item')
      .append('label')
      .call(uiTooltip(context)
        .title(l10n.t('background.panel.tooltip'))
        .shortcut(uiCmd('⌘⇧' + l10n.t('info_panels.background.key')))
        .placement('top')
      );

    panelLabelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', d3_event => {
        d3_event.preventDefault();
        context.systems.ui.info.toggle('background');
      });

    panelLabelEnter
      .append('span')
      .text(l10n.t('background.panel.description'));

    const locPanelLabelEnter = extrasListEnter
      .append('li')
      .attr('class', 'location-panel-toggle-item')
      .append('label')
      .call(uiTooltip(context)
        .title(l10n.t('background.location_panel.tooltip'))
        .shortcut(uiCmd('⌘⇧' + l10n.t('info_panels.location.key')))
        .placement('top')
      );

    locPanelLabelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', d3_event => {
        d3_event.preventDefault();
        context.systems.ui.info.toggle('location');
      });

    locPanelLabelEnter
      .append('span')
      .text(l10n.t('background.location_panel.description'));


    // "Info / Report a Problem" link
    selection.selectAll('.imagery-faq')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'imagery-faq')
      .append('a')
      .attr('target', '_blank')
      .call(uiIcon('#rapid-icon-out-link', 'inline'))
      .attr('href', 'https://github.com/openstreetmap/iD/blob/develop/FAQ.md#how-can-i-report-an-issue-with-background-imagery')
      .append('span')
      .text(l10n.t('background.imagery_problem_faq'));

    _backgroundList
      .call(drawListItems);
  }


  /*
   * setTooltips
   */
  function setTooltips(selection) {
    selection.each((d, i, nodes) => {
      const item = d3_select(nodes[i]).select('label');
      const placement = (i < nodes.length / 2) ? 'bottom' : 'top';

      const tooltip = uiTooltip(context).placement(placement);
      item.call(tooltip.destroyAny);

      let titleHtml = '';
      if (d.description) {
        titleHtml += d.description;
      };
      if (d.id === previousBackgroundID()) {
        titleHtml += '<br/><br/>' + l10n.t('background.switch');
        tooltip.shortcut(uiCmd('⌘' + l10n.t('background.key')));
      }

      if (titleHtml) {
        tooltip.title(titleHtml);
        item.call(tooltip);
      }
    });
  }


  /*
   * sortSources
   */
  function sortSources(a, b) {
    return _favoriteIDs.has(a.id) && !_favoriteIDs.has(b.id) ? -1
      : _favoriteIDs.has(b.id) && !_favoriteIDs.has(a.id) ? 1
      : a.best && !b.best ? -1
      : b.best && !a.best ? 1
      : d3_descending(a.area, b.area) || d3_ascending(a.name, b.name) || 0;
  }


  /*
   * drawListItems
   * @param selection - d3-selection to the background list `ul`
   */
  function drawListItems(selection) {
    const sources = imagery
      .visibleSources()
      .filter(isNotOverlay);

    let listItems = selection.selectAll('li')
      .data(sources, d => d.id);

    // exit
    listItems.exit()
      .remove();

    // enter
    const listItemsEnter = listItems.enter()
      .append('li')
      .classed('layer-custom', d => d.id === 'custom')
      .classed('best', d => d.best);

    const label = listItemsEnter
      .append('label');

    label
      .append('input')
      .attr('type', 'radio')
      .attr('name', 'layers')
      .on('change', chooseBackground);

    label
      .append('span')
      .attr('class', 'background-name')
      .text(d => d.name);

    listItemsEnter
      .append('button')
      .attr('class', 'favorite-background')
      .attr('tabindex', -1)
      .call(uiIcon('', undefined, l10n.t('icons.favorite')))
      .on('click', toggleFavorite);

    listItemsEnter.filter(d => d.id === 'custom')
      .append('button')
      .attr('class', 'layer-browse')
      .call(uiTooltip(context)
        .title(l10n.t('settings.custom_background.tooltip'))
        .placement(l10n.isRTL() ? 'right' : 'left')
      )
      .on('click', clickCustom)
      .call(uiIcon('#rapid-icon-more'));

    listItemsEnter.filter(d => d.best)
      .selectAll('label')
      .append('span')
      .attr('class', 'best')
      .call(uiIcon('#rapid-icon-best-background', undefined, l10n.t('background.best_imagery')));

    // update
    listItems = listItems
      .merge(listItemsEnter)
      .sort(sortSources);

    listItems
      .each((d, i, nodes) => {
        const li = d3_select(nodes[i]);

        li
          .classed('active', d => imagery.showsLayer(d))
          .classed('switch', d => d.id === previousBackgroundID())
          .call(setTooltips)
          .selectAll('input')
          .property('checked', d => imagery.showsLayer(d));

        const isFavorite = _favoriteIDs.has(d.id);
        li.selectAll('button.favorite-background svg.icon')
          .classed('favorite', isFavorite)
          .selectAll('use')
          .attr('href', isFavorite ? '#fas-star' : '#far-star');
      });
  }


  /*
   * chooseBackground
   * @param  d3_event - change event, if called from a change handler (unused)
   * @param  d        - ImagerySource being chosen
   */
  function chooseBackground(d3_event, d) {
    if (d.id === 'custom' && !d.template) {
      return clickCustom();
    }

    const previousBackground = imagery.baseLayerSource();
    if (previousBackground instanceof ImagerySource) {
      storage.setItem('background-last-used-toggle', previousBackground.id);
    }
    storage.setItem('background-last-used', d.id);
    imagery.baseLayerSource(d);
  }


  /*
   * customChanged
   * @param  data - Object containing settings for the custom imagery
   */
  function customChanged(d) {
    if (d?.template) {
      customSource.template = d.template;
      chooseBackground(undefined, customSource);
    } else {
      customSource.template = '';
      chooseBackground(undefined, imagery.getSource('none'));
    }
  }


  /*
   * clickCustom
   * @param  d3_event - click event, if called by a click handler
   */
  function clickCustom(d3_event) {
    if (d3_event) d3_event.preventDefault();
    context.container().call(settingsCustomBackground);
  }


  /*
   * toggleFavorite
   * @param  d3_event - click event, if called from a click handler
   * @param  d        - ImagerySource being chosen
   */
  function toggleFavorite(d3_event, d) {
    d3_event.preventDefault();

    const target = d3_event.currentTarget;
    const selection = d3_select(target);
    selection.node().blur();  // remove focus after click

    if (_favoriteIDs.has(d.id)) {
      selection.classed('favorite', false);
      _favoriteIDs.delete(d.id);
    } else {
      selection.classed('favorite', true);
      _favoriteIDs.add(d.id);
    }

    const vals = [..._favoriteIDs];
    storage.setItem('background-favorites', JSON.stringify(vals));

    d3_select(target.parentElement)
      .transition()
      .duration(300)
      .ease(d3_easeCubicInOut)
      .style('background-color', 'orange')
        .transition()
        .duration(300)
        .ease(d3_easeCubicInOut)
        .style('background-color', null);

    renderIfVisible();
  }


  /*
   * stepBackground
   * This is used to cycle through imagery sources in the list
   * @param step -  item to step to '1' or '-1'
   */
  function stepBackground(step) {
    const backgrounds = imagery
      .visibleSources()
      .filter(isNotOverlay);

    backgrounds.sort(sortSources);
    const currentBackground = imagery.baseLayerSource();
    const currIndex = backgrounds.indexOf(currentBackground);

    // Can't find the current background, bail out (shouldn't happen)
    if (currIndex === -1) return;

    let index = numWrap(currIndex + step, 0, backgrounds.length);
    let choice = backgrounds[index];
    if (choice.id === 'custom' && !choice.template) {   // step past empty custom imagery
      index = numWrap(index + step, 0, backgrounds.length);
      choice = backgrounds[index];
    }

    chooseBackground(undefined, choice);
  }


  /*
   * swapBackground
   * Swap to last used background
   */
  function swapBackground() {
    const sourceID = previousBackgroundID();
    if (!sourceID) return;

    const source = imagery.getSource(sourceID);
    if (!source) return;

    chooseBackground(undefined, source);
  }


  /*
   * nextBackground
   * Step to the next background in the list
   */
  function nextBackground() {
    stepBackground(1);
  }

  /*
   * previousBackground
   * Step to the previous background in the list
   */
  function previousBackground() {
    stepBackground(-1);
  }


  imagery
    .on('imagerychange', renderIfVisible);

  map
    .on('draw', debounce(() => {
        // layers in-view may have changed due to map move
        window.requestIdleCallback(renderIfVisible);
      }, 1000, { leading: true, trailing: true })
    );

  context.keybinding()
    .on(uiCmd('⌘' + l10n.t('background.key')), swapBackground)
    .on(l10n.t('background.next_background.key'), nextBackground)
    .on(l10n.t('background.previous_background.key'), previousBackground);

  return section;
}
