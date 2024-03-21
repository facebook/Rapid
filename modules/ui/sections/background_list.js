import { descending as d3_descending, ascending as d3_ascending } from 'd3-array';
import { select as d3_select } from 'd3-selection';
import { easeCubicInOut as d3_easeCubicInOut } from 'd3-ease';
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
  const map = context.systems.map;
  const l10n = context.systems.l10n;
  const imagery = context.systems.imagery;
  const storage = context.systems.storage;

  const section = uiSection(context, 'background-list')
    .label(l10n.t('background.backgrounds'))
    .disclosureContent(renderDisclosureContent);

  let _backgroundList = d3_select(null);

  const customSource = imagery.getSource('custom');
  const settingsCustomBackground = uiSettingsCustomBackground(context)
    .on('change', customChanged);

  const favoriteBackgroundsJSON = storage.getItem('background-favorites');
  const _favoriteBackgrounds = favoriteBackgroundsJSON ? JSON.parse(favoriteBackgroundsJSON) : {};


  function previousBackgroundID() {
    return storage.getItem('background-last-used-toggle');
  }

  function isNotOverlay(d) {
    return !d.overlay;
  }


  function renderDisclosureContent(selection) {
    // the background list
    const container = selection.selectAll('.layer-background-list')
      .data([0]);

    _backgroundList = container.enter()
      .append('ul')
      .attr('class', 'layer-list layer-background-list')
      .attr('dir', 'auto')
      .merge(container);


    // add minimap toggle below list
    const bgExtrasListEnter = selection.selectAll('.bg-extras-list')
      .data([0])
      .enter()
      .append('ul')
      .attr('class', 'layer-list bg-extras-list');

    const wayBackImageryEnter = bgExtrasListEnter
      .append('li')
      .attr('class', 'background.wayback_imagery.tooltip')
      .append('div')
      .style('display', 'flex');

    const label = wayBackImageryEnter
    .append('label')
    .call(uiTooltip(context)
      .title(l10n.t('background.wayback_imagery.tooltip'))
      .placement('top')
    );

    label
      .append('input')
      .attr('type', 'checkbox')
      .on('change', function(d3_event) {
        d3_event.preventDefault();
        dropdown.style('display', this.checked ? 'block' : 'none');

        if (this.checked) {
          imagery.getWaybackSource().then(sourceMap => {
            const sources = Array.from(sourceMap.sources.values());
            const dates = sources.map(source => {
              const date = source.id.split('_')[1];
              return { value: date };
            });
            dates.sort((a, b) => b.value.localeCompare(a.value));
            dates.forEach(date => {
              dropdown.append('option').text(date.value);
            });
            dropdown.node().dispatchEvent(new Event('change'));
          });
        } else {
          dropdown.selectAll('option').remove();
        }
      });

    const dropdown = wayBackImageryEnter
      .append('select')
      .style('display', 'none')
      .style('vertical-align', 'middle')
      .style('height', '20px')
      .style('width', '120px')
      .style('margin', 'auto')
      .style('cursor', 'pointer')
      .on('change', function() {
        imagery.getWaybackSource().then(sourceMap => {
          const sourceId = sourceMap.sources.keys().next().value;
          const imagerySource = sourceMap.sources.get(sourceId);
          imagery.baseLayerSource(imagerySource);
        });
      });

      dropdown.on('change', function(d3_event) {
        const selectedDate = d3_event.target.value;
        imagery.getWaybackSource().then(sourceMap => {
          // Find the sourceId that corresponds to the selected date
          const sourceId = Array.from(sourceMap.sources.entries())
            .find(([_, source]) => source.id.split('_')[1] === selectedDate)[0];
          const imagerySource = sourceMap.sources.get(sourceId);
          imagery.baseLayerSource(imagerySource);
        });
      });

    label
      .append('span')
      .text(l10n.t('background.wayback_imagery.title'));

    const minimapLabelEnter = bgExtrasListEnter
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


    const threeDmapLabelEnter = bgExtrasListEnter
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


    const panelLabelEnter = bgExtrasListEnter
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

    const locPanelLabelEnter = bgExtrasListEnter
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


  function setTooltips(selection) {
    selection.each((d, i, nodes) => {
      const item = d3_select(nodes[i]).select('label');
      const span = item.select('span');
      const placement = (i < nodes.length / 2) ? 'bottom' : 'top';
      const isOverflowing = (span.property('clientWidth') !== span.property('scrollWidth'));

      item.call(uiTooltip(context).destroyAny);

      if (d.id === previousBackgroundID()) {
        item.call(uiTooltip(context)
          .placement(placement)
          .title(l10n.t('background.switch'))
          .shortcut(uiCmd('⌘' + l10n.t('background.key')))
        );
      } else if (d.description || isOverflowing) {
        item.call(uiTooltip(context)
          .placement(placement)
          .title(d.description || d.name)
        );
      }
    });
  }


  function sortSources(a, b) {
    return _favoriteBackgrounds[a.id] && !_favoriteBackgrounds[b.id] ? -1
      : _favoriteBackgrounds[b.id] && !_favoriteBackgrounds[a.id] ? 1
      : a.best && !b.best ? -1
      : b.best && !a.best ? 1
      : d3_descending(a.area, b.area) || d3_ascending(a.name, b.name) || 0;
  }


  function drawListItems(selection) {
    const sources = imagery
      .sources(map.extent(), map.zoom())
      .filter(isNotOverlay);

    const layerLinks = selection.selectAll('li')
      .data(sources, d => d.id);

    layerLinks.exit()
      .remove();

    const layerLinksEnter = layerLinks.enter()
      .append('li')
      .classed('layer-custom', d => d.id === 'custom')
      .classed('best', d => d.best);

    const label = layerLinksEnter
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

    layerLinksEnter
      .append('button')
      .attr('class', 'background-favorite-button')
      .classed('active', d => !!_favoriteBackgrounds[d.id])
      .attr('tabindex', -1)
      .call(uiIcon('#rapid-icon-favorite'))
      .on('click', (d3_event, d) => {
        if (_favoriteBackgrounds[d.id]) {
          d3_select(d3_event.currentTarget).classed('active', false);
          delete _favoriteBackgrounds[d.id];
        } else {
          d3_select(d3_event.currentTarget).classed('active', true);
          _favoriteBackgrounds[d.id] = true;
        }
        storage.setItem('background-favorites', JSON.stringify(_favoriteBackgrounds));

        d3_select(d3_event.currentTarget.parentElement)
          .transition()
          .duration(300)
          .ease(d3_easeCubicInOut)
          .style('background-color', 'orange')
            .transition()
            .duration(300)
            .ease(d3_easeCubicInOut)
            .style('background-color', null);

        selection.selectAll('li')
          .sort(sortSources);
        selection
          .call(updateLayerSelections);
      });

    layerLinksEnter.filter(d => d.id === 'custom')
      .append('button')
      .attr('class', 'layer-browse')
      .call(uiTooltip(context)
        .title(l10n.t('settings.custom_background.tooltip'))
        .placement(l10n.isRTL() ? 'right' : 'left')
      )
      .on('click', editCustom)
      .call(uiIcon('#rapid-icon-more'));

    layerLinksEnter.filter(d => d.best)
      .selectAll('label')
      .append('span')
      .attr('class', 'best')
      .call(uiTooltip(context)
        .title(l10n.t('background.best_imagery'))
        .placement('bottom')
      )
      .call(uiIcon('#rapid-icon-best-background'));

    selection.selectAll('li')
      .sort(sortSources);

    selection
      .call(updateLayerSelections);

  }

  function updateLayerSelections(selection) {
    function active(d) {
      return imagery.showsLayer(d);
    }

    selection.selectAll('li')
      .classed('active', active)
      .classed('switch', d => d.id === previousBackgroundID())
      .call(setTooltips)
      .selectAll('input')
      .property('checked', active);
  }


  function chooseBackground(d3_event, d) {
    if (d.id === 'custom' && !d.template) {
      return editCustom();
    }

    const previousBackground = imagery.baseLayerSource();
    if (previousBackground instanceof ImagerySource) {
      storage.setItem('background-last-used-toggle', previousBackground.id);
    }
    storage.setItem('background-last-used', d.id);
    imagery.baseLayerSource(d);
  }


  function customChanged(d) {
    if (d?.template) {
      customSource.template = d.template;
      chooseBackground(undefined, customSource);
    } else {
      customSource.template = '';
      chooseBackground(undefined, imagery.getSource('none'));
    }
  }


  function editCustom(d3_event) {
    d3_event.preventDefault();
    context.container()
      .call(settingsCustomBackground);
  }

  function chooseBackgroundAtOffset(offset) {
    const backgrounds = imagery
      .sources(map.extent(), map.zoom())
      .filter(isNotOverlay);

    backgrounds.sort(sortSources);
    const currentBackground = imagery.baseLayerSource();
    const foundIndex = backgrounds.indexOf(currentBackground);
    if (foundIndex === -1) {
      // Can't find the current background, so just do nothing
      return;
    }

    let nextBackgroundIndex = (foundIndex + offset + backgrounds.length) % backgrounds.length;
    let nextBackground = backgrounds[nextBackgroundIndex];
    if (nextBackground.id === 'custom' && !nextBackground.template) {
      nextBackgroundIndex = (nextBackgroundIndex + offset + backgrounds.length) % backgrounds.length;
      nextBackground = backgrounds[nextBackgroundIndex];
    }
    chooseBackground(undefined, nextBackground);
  }

  function nextBackground() {
    chooseBackgroundAtOffset(1);
  }

  function previousBackground() {
    chooseBackgroundAtOffset(-1);
  }


  imagery
    .on('imagerychange', () => _backgroundList.call(updateLayerSelections));

  map
    .on('draw', debounce(() => {
        // layers in-view may have changed due to map move
        window.requestIdleCallback(section.reRender);
      }, 1000, { leading: true, trailing: true })
    );

  context.keybinding()
    .on(l10n.t('background.next_background.key'), nextBackground)
    .on(l10n.t('background.previous_background.key'), previousBackground);

  return section;
}
