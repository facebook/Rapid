import { descending as d3_descending, ascending as d3_ascending } from 'd3-array';
import { select as d3_select } from 'd3-selection';
import { easeCubicInOut as d3_easeCubicInOut } from 'd3-ease';
import debounce from 'lodash-es/debounce';

import { uiTooltip } from '../tooltip';
import { ImagerySource } from '../../core/lib';
import { uiIcon } from '../icon';
import { uiCmd } from '../cmd';
import { uiSettingsCustomBackground } from '../settings/custom_background';
import { uiMapInMap } from '../map_in_map';
import { uiMap3dViewer } from '../map3d_viewer';
import { uiSection } from '../section';


export function uiSectionBackgroundList(context) {
  const l10n = context.localizationSystem();
  const imagerySystem = context.imagerySystem();
  const storageSystem = context.storageSystem();

  const section = uiSection('background-list', context)
    .label(l10n.t('background.backgrounds'))
    .disclosureContent(renderDisclosureContent);

  let _backgroundList = d3_select(null);

  const customSource = imagerySystem.findSource('custom');
  const settingsCustomBackground = uiSettingsCustomBackground(context)
    .on('change', customChanged);

  const favoriteBackgroundsJSON = storageSystem.getItem('background-favorites');
  const _favoriteBackgrounds = favoriteBackgroundsJSON ? JSON.parse(favoriteBackgroundsJSON) : {};


  function previousBackgroundID() {
    return storageSystem.getItem('background-last-used-toggle');
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

    const minimapLabelEnter = bgExtrasListEnter
      .append('li')
      .attr('class', 'minimap-toggle-item')
      .append('label')
      .call(uiTooltip(context)
        .title(l10n.t('background.minimap.tooltip'))
        .keys([l10n.t('background.minimap.key')])
        .placement('top')
      );

    minimapLabelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', (d3_event) => {
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
        .keys([uiCmd('⌘' + l10n.t('background.3dmap.key'))])
        .placement('top')
      );

    threeDmapLabelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', (d3_event) => {
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
        .keys([uiCmd('⌘⇧' + l10n.t('info_panels.background.key'))])
        .placement('top')
      );

    panelLabelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', (d3_event) => {
        d3_event.preventDefault();
        context.ui().info.toggle('background');
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
        .keys([uiCmd('⌘⇧' + l10n.t('info_panels.location.key'))])
        .placement('top')
      );

    locPanelLabelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', (d3_event) => {
        d3_event.preventDefault();
        context.ui().info.toggle('location');
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
      .call(drawListItems, 'radio', chooseBackground, (d) => { return !d.isHidden() && !d.overlay; });
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
          .title('<div>' + l10n.t('background.switch') + '</div>')
          .keys([uiCmd('⌘' + l10n.t('background.key'))])
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


  function drawListItems(layerList, type, change, filter) {
    const sources = imagerySystem
      .sources(context.mapSystem().extent(), context.mapSystem().zoom())
      .filter(filter);

    const layerLinks = layerList.selectAll('li')
      .data(sources, d => d.id);

    layerLinks.exit()
      .remove();

    const layerLinksEnter = layerLinks.enter()
      .append('li')
      .classed('layer-custom', d => (d.id === 'custom'))
      .classed('best', d => d.best);

    const label = layerLinksEnter
      .append('label');

    label
      .append('input')
      .attr('type', type)
      .attr('name', 'layers')
      .on('change', change);

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
        storageSystem.setItem('background-favorites', JSON.stringify(_favoriteBackgrounds));

        d3_select(d3_event.currentTarget.parentElement)
          .transition()
          .duration(300)
          .ease(d3_easeCubicInOut)
          .style('background-color', 'orange')
            .transition()
            .duration(300)
            .ease(d3_easeCubicInOut)
            .style('background-color', null);

        layerList.selectAll('li')
          .sort(sortSources);
        layerList
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

    layerList.selectAll('li')
      .sort(sortSources);

    layerList
      .call(updateLayerSelections);

  }

  function updateLayerSelections(selection) {
    function active(d) {
      return imagerySystem.showsLayer(d);
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

    const previousBackground = imagerySystem.baseLayerSource();
    if (previousBackground instanceof ImagerySource) {
      storageSystem.setItem('background-last-used-toggle', previousBackground.id);
    }
    storageSystem.setItem('background-last-used', d.id);
    imagerySystem.baseLayerSource(d);
  }


  function customChanged(d) {
    if (d && d.template) {
      customSource.template = d.template;
      chooseBackground(undefined, customSource);
    } else {
      customSource.template = '';
      chooseBackground(undefined, imagerySystem.findSource('none'));
    }
  }


  function editCustom(d3_event) {
    d3_event.preventDefault();
    context.container()
      .call(settingsCustomBackground);
  }

  function getBackgrounds(filter) {
    return imagerySystem
      .sources(context.mapSystem().extent(), context.mapSystem().zoom())
      .filter(filter);
  }

  function chooseBackgroundAtOffset(offset) {
    const backgrounds = getBackgrounds((d) => { return !d.isHidden() && !d.overlay; });
    backgrounds.sort(sortSources);
    const currentBackground = imagerySystem.baseLayerSource();
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


  imagerySystem
    .on('imagerychange', () => _backgroundList.call(updateLayerSelections));

  context.mapSystem()
    .on('draw', debounce(() => {
        // layers in-view may have changed due to map move
        window.requestIdleCallback(section.reRender);
      }, 1000)
    );

  context.keybinding()
    .on(l10n.t('background.next_background.key'), nextBackground)
    .on(l10n.t('background.previous_background.key'), previousBackground);

  return section;
}
