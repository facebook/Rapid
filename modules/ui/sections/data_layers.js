import { select as d3_select } from 'd3-selection';

import { uiTooltip } from '../tooltip.js';
import { uiIcon } from '../icon.js';
import { uiSection } from '../section.js';
import { uiSettingsCustomData } from '../settings/custom_data.js';
import { utilCmd } from '../../util/cmd.js';


/** uiSectionDataLayers
 *  This collapsable section displays various checkboxes for toggleable data layers.
 *  (and some other checkboxes below it)
 *  There was some attempt made at grouping them logically.
 *  It lives in the Map Data pane.
 *
 *  ⋁ Data Layers
 *    ◻ OpenStreetMap Data
 *    ◻ OpenStreetMap Notes
 *    ◻ Rapid Data
 *
 *    ◻ KeepRight Issues
 *    …
 *
 *    ◻ Custom Map Data      …
 *
 *    ◻ Show History Panel
 *    ◻ Show Measurement Panel
 */
export function uiSectionDataLayers(context) {
  const l10n = context.systems.l10n;
  const scene = context.systems.gfx.scene;
  const ui = context.systems.ui;

  const section = uiSection(context, 'data-layers')
    .label(l10n.t('map_data.data_layers'))
    .disclosureContent(render);

  const settingsCustomData = uiSettingsCustomData(context)
    .on('change', customChanged);

  let _previousLayerStates = new Map();
  let _keys = null;


  /*
   * toggleAllLayers
   * @param  {Event} e? - triggering event (if any)
   */
  function toggleAllLayers(e) {
    if (e)  e.preventDefault();

    const allLayerIDs = [
      'osm', 'notes', 'rapid', 'maproulette', 'keepRight', 'osmose', 'geoScribble',
      'custom-data', 'mapillary', 'streetside', 'kartaview'
    ];

    const anyLayerEnabled = allLayerIDs.some(layerID => showsLayer(layerID));
    if (anyLayerEnabled) {
      // Save current state and disable all layers
      allLayerIDs.forEach(layerID => {
        _previousLayerStates.set(layerID, showsLayer(layerID));
        setLayer(layerID, false);
      });
    } else {
      // Restore previous state
      _previousLayerStates.forEach((enabled, layerID) => {
        setLayer(layerID, enabled);
      });
    }
  }


  /*
   * toggleLayerKey
   * Just wraps calls to `toggleLayer`, cancelling the key event
   * @param  {Event}  e? - triggering event (if any)
   */
  function toggleLayerKey(e, layerID) {
    if (e)  e.preventDefault();
    toggleLayer(layerID);
  }


  /*
   * renderIfVisible
   * This calls render on the Disclosure commponent.
   * It skips actual rendering if the disclosure is closed
   */
  function renderIfVisible() {
    section.reRender();
  }


  /*
   * render
   * Render the data layer list and the checkboxes below it
   */
  function render(selection) {
    let container = selection.selectAll('.data-layer-container')
      .data([0]);

    container.enter()
      .append('div')
      .attr('class', 'data-layer-container')
      .merge(container)
      .call(drawBaseItems)
      .call(drawQAItems)
      .call(drawCustomDataItems)
      .call(drawPanelItems);
  }


  function showsLayer(layerID) {
    const layer = scene.layers.get(layerID);
    return layer?.enabled;
  }


  function setLayer(layerID, val) {
    // Don't allow layer changes while drawing - iD#6584
    const mode = context.mode;
    if (mode && /^draw/.test(mode.id)) return;

    if (val) {
      scene.enableLayers(layerID);
    } else {
      scene.disableLayers(layerID);
      if (layerID === 'osm' || layerID === 'notes') {
        context.enter('browse');
      }
    }
  }


  function toggleLayer(layerID) {
    setLayer(layerID, !showsLayer(layerID));
  }


  function setTooltips(selection) {
    selection.each((d, i, nodes) => {
      const item = d3_select(nodes[i]).select('label');
      const placement = (i < nodes.length / 2) ? 'bottom' : 'top';

      const tooltip = uiTooltip(context).placement(placement);
      item.call(tooltip.destroyAny);

      let titleHtml = '';
      if (d.id) {
        titleHtml += d.id;
      };

      if (titleHtml) {
        tooltip.title(l10n.t(`map_data.layers.${d.id}.tooltip`));
        item.call(tooltip);
      }
    });
  }


  function drawBaseItems(selection) {
    const items = [
      { id: 'osm',   layer: scene.layers.get('osm'),   key: 'shortcuts.command.toggle_osm_data.key' },
      { id: 'notes', layer: scene.layers.get('notes'), key: 'shortcuts.command.toggle_osm_notes.key' },
      { id: 'rapid', layer: scene.layers.get('rapid'), key: 'shortcuts.command.toggle_rapid_data.key' }
    ];

    let ul = selection
      .selectAll('.layer-list-osm')
      .data([0]);

    ul = ul.enter()
      .append('ul')
      .attr('class', 'layer-list layer-list-osm')
      .merge(ul);

    let li = ul.selectAll('.list-item')
      .data(items);

    li.exit()
      .remove();

    let liEnter = li.enter()
      .append('li')
      .attr('class', d => `list-item list-item-${d.id}`);

    let labelEnter = liEnter
      .append('label')
      .each((d, i, nodes) => {
        d3_select(nodes[i])
          .call(uiTooltip(context)
            .title(l10n.t(`map_data.layers.${d.id}.tooltip`))
            .shortcut(utilCmd('⇧' + l10n.t(d.key)))
            .placement('bottom')
          );
      });

    labelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', (e, d) => toggleLayer(d.id));

    labelEnter
      .append('span')
      .text(d => l10n.t(`map_data.layers.${d.id}.title`));

    // Update
    li
      .merge(liEnter)
      .classed('active', d => showsLayer(d.id))
      .selectAll('input')
      .property('checked', d => showsLayer(d.id));
  }


  function drawQAItems(selection) {
    const qaKeys = ['maproulette', 'keepRight', 'osmose', 'geoScribble'];
    const qaLayers = qaKeys.map(layerID => scene.layers.get(layerID)).filter(Boolean);
    const maproulette = context.services.maproulette;

    let ul = selection
      .selectAll('.layer-list-qa')
      .data([0]);

    ul = ul.enter()
      .append('ul')
      .attr('class', 'layer-list layer-list-qa')
      .merge(ul);

    let li = ul.selectAll('.list-item')
      .data(qaLayers);

    li.exit()
      .remove();

    let liEnter = li.enter()
      .append('li')
      .attr('class', d => `list-item list-item-${d.id}`);

    let labelEnter = liEnter
      .append('label')
      .attr('class', 'content-label');

    labelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', (e, d) => toggleLayer(d.id));

    labelEnter
      .append('span')
      .text(d => l10n.t(`map_data.layers.${d.id}.title`, { n: 999 }));

    // Add input box for MapRoulette challenge IDs
    labelEnter.filter(d => d.id === 'maproulette')
      .append('input')
      .attr('type', 'text')
      .attr('placeholder', l10n.t('map_data.layers.maproulette.id_placeholder'))
      .attr('class', 'challenge-ids')
      .on('change', mapRouletteIDsChanged);


    // Update
    li = li.merge(liEnter);

    li
      .classed('active', d => d.enabled)
      .call(setTooltips)
      .selectAll('input[type="checkbox"]')
      .property('checked', d => d.enabled);

    li
      .selectAll('input.challenge-ids')
      .attr('value', maproulette.challengeIDs);
  }


  function drawCustomDataItems(selection) {
    const customLayer = scene.layers.get('custom-data');
    const isRTL = l10n.isRTL();

    let ul = selection
      .selectAll('.layer-list-data')
      .data(customLayer ? [customLayer] : []);

    // Exit
    ul.exit()
      .remove();

    // Enter
    let ulEnter = ul.enter()
      .append('ul')
      .attr('class', 'layer-list layer-list-data');

    let liEnter = ulEnter
      .append('li')
      .attr('class', 'list-item-data');

    let labelEnter = liEnter
      .append('label')
      .call(uiTooltip(context)
        .title(l10n.t('map_data.layers.custom.tooltip'))
        .placement('top')
      );

    labelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', () => toggleLayer('custom-data'));

    labelEnter
      .append('span')
      .text(l10n.t('map_data.layers.custom.title'));

    liEnter
      .append('button')
      .attr('class', 'open-data-options')
      .call(uiTooltip(context)
        .title(l10n.t('settings.custom_data.tooltip'))
        .placement(isRTL ? 'right' : 'left')
      )
      .on('click', d3_event => {
        d3_event.preventDefault();
        editCustom();
      })
      .call(uiIcon('#rapid-icon-more'));

    liEnter
      .append('button')
      .attr('class', 'zoom-to-data')
      .call(uiTooltip(context)
        .title(l10n.t('map_data.layers.custom.zoom'))
        .placement(isRTL ? 'right' : 'left')
      )
      .on('click', function(d3_event) {
        if (d3_select(this).classed('disabled')) return;
        d3_event.preventDefault();
        d3_event.stopPropagation();
        const customLayer = scene.layers.get('custom-data');
        customLayer?.fitZoom();
      })
      .call(uiIcon('#rapid-icon-framed-dot', 'monochrome'));

    // Update
    ul = ul
      .merge(ulEnter);

    ul.selectAll('.list-item-data')
      .classed('active', d => d.enabled)
      .selectAll('label')
      .classed('deemphasize', d => !d.hasData)
      .selectAll('input')
      .property('disabled', d => !d.hasData)
      .property('checked', d => d.enabled);

    ul.selectAll('button.zoom-to-data')
      .classed('disabled', d => !d.hasData);
  }


  function editCustom() {
    context.container()
      .call(settingsCustomData);
  }


  function customChanged(d) {
    const customLayer = scene.layers.get('custom-data');
    if (!customLayer) return;

    if (d?.url) {
      customLayer.setUrl(d.url);
    } else if (d?.fileList) {
      customLayer.setFileList(d.fileList);
    }
  }


  /*
   * mapRouletteIDsChanged
   * @param  d3_event - change event, if called from a change handler
   */
  function mapRouletteIDsChanged(d3_event) {
    const maproulette = context.services.maproulette;
    maproulette.challengeIDs = d3_event.target.value;
  }


  function drawPanelItems(selection) {
    const HistoryCard = ui.InfoCards.HistoryCard;
    const MeasurementCard = ui.InfoCards.MeasurementCard;

    let panelsListEnter = selection.selectAll('.md-extras-list')
      .data([0])
      .enter()
      .append('ul')
      .attr('class', 'layer-list md-extras-list');

    let historyPanelLabelEnter = panelsListEnter
      .append('li')
      .attr('class', 'history-panel-toggle-item')
      .append('label')
      .call(uiTooltip(context)
        .title(l10n.t('map_data.history_panel.tooltip'))
        .shortcut(utilCmd('⌘⇧' + l10n.t('shortcuts.command.toggle_history_card.key')))
        .placement('top')
      );

    historyPanelLabelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', HistoryCard.toggle);

    historyPanelLabelEnter
      .append('span')
      .text(l10n.t('map_data.history_panel.title'));

    let measurementPanelLabelEnter = panelsListEnter
      .append('li')
      .attr('class', 'measurement-panel-toggle-item')
      .append('label')
      .call(uiTooltip(context)
        .title(l10n.t('map_data.measurement_panel.tooltip'))
        .shortcut(utilCmd('⌘⇧' + l10n.t('shortcuts.command.toggle_measurement_card.key')))
        .placement('top')
      );

    measurementPanelLabelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', MeasurementCard.toggle);

    measurementPanelLabelEnter
      .append('span')
      .text(l10n.t('map_data.measurement_panel.title'));


    // update
    selection.selectAll('.history-panel-toggle-item')
      .classed('active', HistoryCard.visible)
      .selectAll('input')
      .property('checked', HistoryCard.visible);

    selection.selectAll('.measurement-panel-toggle-item')
      .classed('active', MeasurementCard.visible)
      .selectAll('input')
      .property('checked', MeasurementCard.visible);
  }


  /**
   * _setupKeybinding
   * This sets up the keybinding, replacing existing if needed
   */
  function _setupKeybinding() {
    const keybinding = context.keybinding();
    const l10n = context.systems.l10n;

    if (Array.isArray(_keys)) {
      keybinding.off(_keys);
    }

    // setup key shortcuts
    const toggleAllKey = utilCmd('⇧' + l10n.t('shortcuts.command.toggle_all_layers.key'));
    const toggleOsmKey = utilCmd('⇧' + l10n.t('shortcuts.command.toggle_osm_data.key'));
    const toggleNotesKey = utilCmd('⇧' + l10n.t('shortcuts.command.toggle_osm_notes.key'));
    const toggleRapidKey = utilCmd('⇧' + l10n.t('shortcuts.command.toggle_rapid_data.key'));
    const toggleMapillaryKey = utilCmd('⇧' + l10n.t('shortcuts.command.toggle_mapillary.key'));
    const toggleStreetsideKey = utilCmd('⇧' + l10n.t('shortcuts.command.toggle_streetside.key'));
    const toggleKartaviewKey = utilCmd('⇧' + l10n.t('shortcuts.command.toggle_kartaview.key'));

    _keys = [
      toggleAllKey, toggleOsmKey, toggleNotesKey, toggleRapidKey,
      toggleMapillaryKey, toggleStreetsideKey, toggleKartaviewKey
    ];

    keybinding
      .on(toggleAllKey, e => toggleAllLayers(e))
      .on(toggleOsmKey, e => toggleLayerKey(e, 'osm'))
      .on(toggleNotesKey, e => toggleLayerKey(e, 'notes'))
      .on(toggleRapidKey, e => toggleLayerKey(e, 'rapid'))
      .on(toggleMapillaryKey, e => toggleLayerKey(e, 'mapillary'))
      .on(toggleStreetsideKey, e => toggleLayerKey(e, 'streetside'))
      .on(toggleKartaviewKey, e => toggleLayerKey(e, 'kartaview'));
  }


  // Add or replace event handlers
  scene.off('layerchange', renderIfVisible);
  scene.on('layerchange', renderIfVisible);
  l10n.off('localechange', _setupKeybinding);
  l10n.on('localechange', _setupKeybinding);

  _setupKeybinding();

  return section;
}
