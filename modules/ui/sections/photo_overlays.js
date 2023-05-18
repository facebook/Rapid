import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { uiTooltip } from '../tooltip';
import { uiSection } from '../section';
import { utilGetSetValue, utilNoAuto } from '../../util';


export function uiSectionPhotoOverlays(context) {
  const photoSystem = context.photoSystem();
  const section = uiSection('photo-overlays', context)
    .label(t.html('photo_overlays.title'))
    .disclosureContent(renderDisclosureContent)
    .expandedByDefault(false);

  const scene = context.scene();


  function renderDisclosureContent(selection) {
    let container = selection.selectAll('.photo-overlay-container')
      .data([0]);

    container.enter()
      .append('div')
      .attr('class', 'photo-overlay-container')
      .merge(container)
      .call(drawPhotoItems)
      .call(drawPhotoTypeItems)
      .call(drawDateFilter)
      .call(drawUsernameFilter);
  }


  function showsLayer(layerID) {
    const layer = scene.layers.get(layerID);
    return layer && layer.enabled;
  }


  function setLayer(layerID, val) {
    // Don't allow layer changes while drawing - #6584
    const mode = context.mode();
    if (mode && /^draw/.test(mode.id)) return;

    if (val) {
      scene.enableLayers(layerID);
    } else {
      scene.disableLayers(layerID);
    }
  }


  function toggleLayer(layerID) {
    setLayer(layerID, !showsLayer(layerID));
  }


  function drawPhotoItems(selection) {
    const photoKeys = photoSystem.overlayLayerIDs;
    const photoLayers = photoKeys.map(layerID => scene.layers.get(layerID)).filter(Boolean);
    const data = photoLayers.filter(layer => layer.supported);

    function layerSupported(d) {
      return d && d.supported;
    }
    function layerEnabled(d) {
      return layerSupported(d) && d.enabled;
    }

    let ul = selection
      .selectAll('.layer-list-photos')
      .data([0]);

    ul = ul.enter()
      .append('ul')
      .attr('class', 'layer-list layer-list-photos')
      .merge(ul);

    let li = ul.selectAll('.list-item-photos')
      .data(data);

    li.exit()
      .remove();

    let liEnter = li.enter()
      .append('li')
      .attr('class', function (d) {
        var classes = 'list-item-photos list-item-' + d.id;
        if (d.id === 'mapillary-signs' || d.id === 'mapillary-map-features') {
          classes += ' indented';
        }
        return classes;
      });

    let labelEnter = liEnter
      .append('label')
      .each((d, i, nodes) => {
        let titleID;
        if (d.id === 'mapillary-signs') titleID = 'mapillary.signs.tooltip';
        else if (d.id === 'mapillary') titleID = 'mapillary_images.tooltip';
        else if (d.id === 'kartaview') titleID = 'kartaview_images.tooltip';
        else titleID = d.id.replace(/-/g, '_') + '.tooltip';
        d3_select(nodes[i])
          .call(uiTooltip()
            .title(t.html(titleID))
            .placement('top')
          );
      });

    labelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', (d3_event, d) => toggleLayer(d.id));

    labelEnter
      .append('span')
      .html(d => {
        let titleID = d.id;
        if (titleID === 'mapillary-signs') titleID = 'photo_overlays.traffic_signs';
        return t.html(titleID.replace(/-/g, '_') + '.title');
      });

    // Update
    li
      .merge(liEnter)
      .classed('active', layerEnabled)
      .selectAll('input')
      .property('checked', layerEnabled);
  }


  function drawPhotoTypeItems(selection) {
    const photoTypes = photoSystem.allPhotoTypes;

    function typeEnabled(d) {
      return photoSystem.showsPhotoType(d);
    }

    let ul = selection
      .selectAll('.layer-list-photo-types')
      .data([0]);

    ul.exit()
      .remove();

    ul = ul.enter()
      .append('ul')
      .attr('class', 'layer-list layer-list-photo-types')
      .merge(ul);

    let li = ul.selectAll('.list-item-photo-types')
      .data(photoSystem.shouldFilterByPhotoType() ? photoTypes : []);

    li.exit()
      .remove();

    let liEnter = li.enter()
      .append('li')
      .attr('class', d => `list-item-photo-types list-item-${d}`);

    let labelEnter = liEnter
      .append('label')
      .each(function(d) {
        d3_select(this)
          .call(uiTooltip()
            .title(t.html(`photo_overlays.photo_type.${d}.tooltip`))
            .placement('top')
          );
      });

    labelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', (d3_event, d) => photoSystem.togglePhotoType(d));

    labelEnter
      .append('span')
      .html(d => t.html(`photo_overlays.photo_type.${d}.title`));

    // Update
    li
      .merge(liEnter)
      .classed('active', typeEnabled)
      .selectAll('input')
      .property('checked', typeEnabled);
  }


  function drawDateFilter(selection) {
    const dateFilterTypes = photoSystem.dateFilters;

    function filterEnabled(d) {
      return photoSystem.dateFilterValue(d);
    }

    let ul = selection
      .selectAll('.layer-list-date-filter')
      .data([0]);

    ul.exit()
      .remove();

    ul = ul.enter()
      .append('ul')
      .attr('class', 'layer-list layer-list-date-filter')
      .merge(ul);

    let li = ul.selectAll('.list-item-date-filter')
      .data(photoSystem.shouldFilterByDate() ? dateFilterTypes : []);

    li.exit()
      .remove();

    let liEnter = li.enter()
      .append('li')
      .attr('class', 'list-item-date-filter');

    let labelEnter = liEnter
      .append('label')
      .each((d, i, nodes) => {
        d3_select(nodes[i])
          .call(uiTooltip()
            .title(t.html(`photo_overlays.date_filter.${d}.tooltip`))
            .placement('top')
          );
      });

    labelEnter
      .append('span')
      .html(d => t.html(`photo_overlays.date_filter.${d}.title`));

    labelEnter
      .append('input')
      .attr('type', 'date')
      .attr('class', 'list-item-input')
      .attr('placeholder', t('units.year_month_day'))
      .call(utilNoAuto)
      .each((d, i, nodes) => {
        utilGetSetValue(d3_select(nodes[i]), photoSystem.dateFilterValue(d) || '');
      })
      .on('change', function(d3_event, d) {
        let value = utilGetSetValue(d3_select(this)).trim();
        photoSystem.setDateFilter(d, value, true);
        // reload the displayed dates
        li.selectAll('input')
          .each(function(d) {
            utilGetSetValue(d3_select(this), photoSystem.dateFilterValue(d) || '');
          });
      });

    li = li
      .merge(liEnter)
      .classed('active', filterEnabled);
  }


  function drawUsernameFilter(selection) {
    function filterEnabled() {
      return photoSystem.usernames;
    }

    let ul = selection
      .selectAll('.layer-list-username-filter')
      .data([0]);

    ul.exit()
      .remove();

    ul = ul.enter()
      .append('ul')
      .attr('class', 'layer-list layer-list-username-filter')
      .merge(ul);

    let li = ul.selectAll('.list-item-username-filter')
      .data(photoSystem.shouldFilterByUsername() ? ['username-filter'] : []);

    li.exit()
      .remove();

    let liEnter = li.enter()
      .append('li')
      .attr('class', 'list-item-username-filter');

    let labelEnter = liEnter
      .append('label')
      .each((d, i, nodes) => {
        d3_select(nodes[i])
          .call(uiTooltip()
            .title(t.html('photo_overlays.username_filter.tooltip'))
            .placement('top')
          );
      });

    labelEnter
      .append('span')
      .html(t.html('photo_overlays.username_filter.title'));

    labelEnter
      .append('input')
      .attr('type', 'text')
      .attr('class', 'list-item-input')
      .call(utilNoAuto)
      .property('value', usernameValue)
      .on('change', function() {
        let value = d3_select(this).property('value');
        photoSystem.setUsernameFilter(value, true);
        d3_select(this).property('value', usernameValue);
      });

    li
      .merge(liEnter)
      .classed('active', filterEnabled);

    function usernameValue() {
      let usernames = photoSystem.usernames;
      if (usernames) return usernames.join('; ');
      return usernames;
    }
  }


  context.scene().on('layerchange', section.reRender);
  photoSystem.on('photochange', section.reRender);

  return section;
}
