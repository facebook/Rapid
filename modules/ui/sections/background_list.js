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
import { uiSection } from '../section.js';


/** uiSectionBackgroundList
 *  This collapsable section displays a radio button list of background imagery.
 *  (and some other checkboxes below it)
 *  Each list item also adds star buttons so users can select their favorite items.
 *  It lives in the Background Settings pane.
 *
 *  ⋁ Backgrounds
 *    ○ Bing Maps Aerial    ☆
 *    ○ Esri Wayback        ☆
 *    ○ Esri World Imagery  ☆
 *    …
 *    ○ None                ☆
 *    ○ Custom              …
 *
 *    ◻ Show Minimap
 *    ◻ Show 3d Map
 *    …
 */
export function uiSectionBackgroundList(context) {
  const imagery = context.systems.imagery;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const map3d = context.systems.map3d;
  const storage = context.systems.storage;
  const ui = context.systems.ui;

  const section = uiSection(context, 'background-list')
    .label(l10n.t('background.backgrounds'))
    .disclosureContent(render);

  let _backgroundList = d3_select(null);

  const customSource = imagery.getSourceByID('custom');
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
      .merge(container);

    // extra checkboxes below the list
    const extrasListEnter = selection.selectAll('.bg-extras-list')
      .data([0])
      .enter()
      .append('ul')
      .attr('class', 'layer-list bg-extras-list');

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


    const map3dLabelEnter = extrasListEnter
      .append('li')
      .attr('class', 'map3d-toggle-item')
      .append('label')
      .call(uiTooltip(context)
        .title(l10n.t('background.3dmap.tooltip'))
        .shortcut(uiCmd('⌘' + l10n.t('background.3dmap.key')))
        .placement('top')
      );

    map3dLabelEnter
      .append('input')
      .attr('type', 'checkbox')
      .attr('class', 'map3d-toggle-checkbox')
      .on('change', d3_event => {
        d3_event.preventDefault();
        const input = d3_event.currentTarget;
        map3d.visible = input.checked;
      });

    map3dLabelEnter
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
        ui.info.toggle('background');
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
        ui.info.toggle('location');
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


    // update
    const extrasList = selection.selectAll('.bg-extras-list');

    extrasList.selectAll('.map3d-toggle-item')
      .classed('active', d => map3d.visible)
      .selectAll('.map3d-toggle-checkbox')
      .property('checked', d => map3d.visible);
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
      .each((d, i, nodes) => {
        const li = d3_select(nodes[i]);

        // Wayback gets an extra dropdown for picking the date
        if (d.id === 'EsriWayback') {
          li
            .selectAll('label')
            .append('select')
            .attr('class', 'wayback-date')
            .on('change', waybackDateChange);
        }

        // Add favorite button
        if (d.id !== 'custom') {
          li
            .append('button')
            .attr('class', 'favorite-background')
            .attr('tabindex', -1)
            .call(uiIcon('', undefined, l10n.t('icons.favorite')))
            .on('click', toggleFavorite);
        }

        // Custom gets a different button: '...'
        if (d.id === 'custom') {
          li
            .append('button')
            .attr('class', 'layer-browse')
            .call(uiTooltip(context)
              .title(l10n.t('settings.custom_background.tooltip'))
              .placement(l10n.isRTL() ? 'right' : 'left')
            )
            .on('click', clickCustom)
            .call(uiIcon('#rapid-icon-more'));
        }

        // "Best" backgrounds get a badge
        if (d.best) {
          li
            .selectAll('label')
            .append('span')
            .attr('class', 'best')
            .call(uiIcon('#rapid-icon-best-background', undefined, l10n.t('background.best_imagery')));
        }
      });


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

        // Update the Wayback release date options
        if (d.id === 'EsriWayback') {
          const currDate = d.date;
          const dropdown = li.selectAll('.wayback-date');
          const options = dropdown.selectAll('option')
            .data(d.localReleaseDates, d => d);

          options.exit()
            .remove();

          const optionsEnter = options.enter()
            .append('option')
            .attr('value', d => d)
            .text(d => d);

          options.merge(optionsEnter)
            .attr('selected', d => (d === currDate ? '' : null))
            .order();
        }

        // Update the favorite button
        const isFavorite = _favoriteIDs.has(d.id);
        li.selectAll('button.favorite-background svg.icon')
          .classed('favorite', isFavorite)
          .selectAll('use')
          .attr('href', isFavorite ? '#fas-star' : '#far-star');
      });
  }


  /*
   * chooseBackground
   * @param  d3_event          - change event, if called from a change handler (unused)
   * @param  sourceOrSourceID  - `string` or `ImagerySource` being chosen
   */
  function chooseBackground(d3_event, sourceOrSourceID) {
    let source, sourceID;
    if (sourceOrSourceID instanceof ImagerySource) {
      source = sourceOrSourceID;
      sourceID = sourceOrSourceID.id;
    } else {
      sourceID = sourceOrSourceID;
    }

    // If no custom template, open the custom settings dialog..
    if (sourceID === 'custom' && !source?.template) {
      return clickCustom();
    }

    const previousBackground = imagery.baseLayerSource();
    if (previousBackground instanceof ImagerySource) {
      storage.setItem('background-last-used-toggle', previousBackground.id);
    }
    storage.setItem('background-last-used', sourceID);
    imagery.setSourceByID(sourceID);
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
      chooseBackground(undefined, 'none');
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
   * waybackDateChange
   * @param  d3_event - change event, if called from a change handler
   */
  function waybackDateChange(d3_event) {
    let sourceID = 'EsriWayback';
    const selectedDate = d3_event.target.value;
    if (selectedDate) {
      sourceID += '_' + selectedDate;
    }

    chooseBackground(undefined, sourceID);
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
    if (sourceID) chooseBackground(undefined, sourceID);
  }


  /*
   * nextBackground
   * Step to the next background in the list
   */
  function nextBackground() {
    stepBackground(1);
  }

  /*
   * prevBackground
   * Step to the previous background in the list
   */
  function prevBackground() {
    stepBackground(-1);
  }


  /*
   * onMapDraw
   * Redraw the list sometimes if the map has moved
   */
  function onMapDraw() {
    const wayback = imagery.getSourceByID('EsriWayback');
    wayback.refreshLocalReleaseDatesAsync();

    window.requestIdleCallback(() => {
      renderIfVisible();
    });
  }


  const deferredOnMapDraw = debounce(onMapDraw, 1000, { leading: true, trailing: true });

  imagery.on('imagerychange', renderIfVisible);
  map.on('draw', deferredOnMapDraw);

  const swapBackgroundKey = uiCmd('⌘' + l10n.t('background.key'));
  const nextBackgroundKey = l10n.t('background.next_background.key');
  const prevBackgroundKey = l10n.t('background.previous_background.key');

  context.keybinding()
    .off([swapBackgroundKey, nextBackgroundKey, prevBackgroundKey]);

  context.keybinding()
    .on(swapBackgroundKey, swapBackground)
    .on(nextBackgroundKey, nextBackground)
    .on(prevBackgroundKey, prevBackground);

  return section;
}
