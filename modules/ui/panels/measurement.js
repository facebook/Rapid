import { geoLength as d3_geoLength, geoPath as d3_geoPath } from 'd3-geo';
import { Extent, geoSphericalDistance } from '@id-sdk/math';
import { utilGetAllNodes } from '@id-sdk/util';

import { t, localizer } from '../../core/localizer';
import { displayArea, displayLength, decimalCoordinatePair, dmsCoordinatePair } from '../../util/units';
import { services } from '../../services';


export function uiPanelMeasurement(context) {

  function radiansToMeters(r) {
    // using WGS84 authalic radius (6371007.1809 m)
    return r * 6371007.1809;
  }

  function steradiansToSqmeters(r) {
    // http://gis.stackexchange.com/a/124857/40446
    return r / (4 * Math.PI) * 510065621724000;
  }


  function toLineString(feature) {
    if (feature.type === 'LineString') return feature;

    const result = { type: 'LineString', coordinates: [] };
    if (feature.type === 'Polygon') {
      result.coordinates = feature.coordinates[0];
    } else if (feature.type === 'MultiPolygon') {
      result.coordinates = feature.coordinates[0][0];
    }

    return result;
  }


  let _isImperial = !localizer.usesMetric();


  function redraw(selection) {
    let graph = context.graph();
    let selectedNoteID = context.selectedNoteID();
    let osm = services.osm;

    let localeCode = localizer.localeCode();

    let heading;
    let center, location, centroid;
    let closed, geometry;
    let totalNodeCount;
    let length = 0;
    let area = 0;
    let distance;

    if (selectedNoteID && osm) {       // selected 1 note
      let note = osm.getNote(selectedNoteID);
      heading = t('note.note') + ' ' + selectedNoteID;
      location = note.loc;
      geometry = 'note';

    } else {    // selected 1..n entities
      let selectedIDs = context.selectedIDs().filter(id => context.hasEntity(id));
      let selected = selectedIDs.map(id => context.entity(id));

      heading = selected.length === 1 ? selected[0].id : t('info_panels.selected', { n: selected.length });

      if (selected.length) {
        let extent = new Extent();
        for (let i in selected) {
          let entity = selected[i];
          extent = extent.extend(entity.extent(graph));

          geometry = entity.geometry(graph);
          if (geometry === 'line' || geometry === 'area') {
            closed = (entity.type === 'relation') || (entity.isClosed() && !entity.isDegenerate());
            let feature = entity.asGeoJSON(graph);
            length += radiansToMeters(d3_geoLength(toLineString(feature)));
            centroid = d3_geoPath(context.projection).centroid(entity.asGeoJSON(graph));
            centroid = centroid && context.projection.invert(centroid);
            if (!centroid  || !isFinite(centroid[0]) || !isFinite(centroid[1])) {
              centroid = entity.extent(graph).center();
            }
            if (closed) {
              area += steradiansToSqmeters(entity.area(graph));
            }
          }
        }

        if (selected.length > 1) {
          geometry = null;
          closed = null;
          centroid = null;
        }

        if (selected.length === 2 && selected[0].type === 'node' && selected[1].type === 'node') {
          distance = geoSphericalDistance(selected[0].loc, selected[1].loc);
        }

        if (selected.length === 1 && selected[0].type === 'node') {
          location = selected[0].loc;
        } else {
          totalNodeCount = utilGetAllNodes(selectedIDs, context.graph()).length;
        }

        if (!location && !centroid) {
          center = extent.center();
        }
      }
    }

    selection.html('');

    if (heading) {
      selection
        .append('h4')
        .attr('class', 'measurement-heading')
        .html(heading);
    }

    let list = selection.append('ul');
    let coordItem;

    if (geometry) {
      list
        .append('li')
        .html(t.html('info_panels.measurement.geometry') + ':')
        .append('span')
        .html(closed ? t('info_panels.measurement.closed_' + geometry) : t('geometry.' + geometry));
    }

    if (totalNodeCount) {
      list
        .append('li')
        .html(t.html('info_panels.measurement.node_count') + ':')
        .append('span')
        .html(totalNodeCount.toLocaleString(localeCode));
    }

    if (area) {
      list
        .append('li')
        .html(t.html('info_panels.measurement.area') + ':')
        .append('span')
        .html(displayArea(area, _isImperial));
    }

    if (length) {
      list
        .append('li')
        .html(t.html('info_panels.measurement.' + (closed ? 'perimeter' : 'length')) + ':')
        .append('span')
        .html(displayLength(length, _isImperial));
    }

    if (typeof distance === 'number') {
      list
        .append('li')
        .html(t.html('info_panels.measurement.distance') + ':')
        .append('span')
        .html(displayLength(distance, _isImperial));
    }

    if (location) {
      coordItem = list
        .append('li')
        .html(t.html('info_panels.measurement.location') + ':');
      coordItem.append('span')
        .html(dmsCoordinatePair(location));
      coordItem.append('span')
        .html(decimalCoordinatePair(location));
    }

    if (centroid) {
      coordItem = list
        .append('li')
        .html(t.html('info_panels.measurement.centroid') + ':');
      coordItem.append('span')
        .html(dmsCoordinatePair(centroid));
      coordItem.append('span')
        .html(decimalCoordinatePair(centroid));
    }

    if (center) {
      coordItem = list
        .append('li')
        .html(t.html('info_panels.measurement.center') + ':');
      coordItem.append('span')
        .html(dmsCoordinatePair(center));
      coordItem.append('span')
        .html(decimalCoordinatePair(center));
    }

    if (length || area || typeof distance === 'number') {
      let toggle  = _isImperial ? 'imperial' : 'metric';
      selection
        .append('a')
        .html(t.html('info_panels.measurement.' + toggle))
        .attr('href', '#')
        .attr('class', 'button button-toggle-units')
        .on('click', d3_event => {
          d3_event.preventDefault();
          _isImperial = !_isImperial;
          selection.call(redraw);
        });
    }
  }


  let panel = function(selection) {
    selection.call(redraw);

    context.map()
      .on('drawn.info-measurement', () => selection.call(redraw));

    context
      .on('enter.info-measurement', () => selection.call(redraw));
  };


  panel.off = function() {
    context.map().on('drawn.info-measurement', null);
    context.on('enter.info-measurement', null);
  };

  panel.id = 'measurement';
  panel.label = t.html('info_panels.measurement.title');
  panel.key = t('info_panels.measurement.key');


  return panel;
}
