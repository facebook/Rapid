import { select as d3_select } from 'd3-selection';
import { geoLength as d3_geoLength, geoPath as d3_geoPath } from 'd3-geo';
import { Extent, geoSphericalDistance } from '@id-sdk/math';
import { utilGetAllNodes } from '@id-sdk/util';

import { AbstractUiPanel } from './AbstractUiPanel';
import { t, localizer } from '../../core/localizer';
import { displayArea, displayLength, decimalCoordinatePair, dmsCoordinatePair } from '../../util/units';
import { services } from '../../services';


// using WGS84 authalic radius (6371007.1809 m)
function radiansToMeters(r) {
  return r * 6371007.1809;
}

// http://gis.stackexchange.com/a/124857/40446
function steradiansToSqmeters(r) {
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



/**
 * UiPanelMeasurement
 */
export class UiPanelMeasurement extends AbstractUiPanel {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'measurement';
    this.label = t.html('info_panels.measurement.title');
    this.key = t('info_panels.measurement.key');

    this._selection = d3_select(null);
    this._isImperial = !localizer.usesMetric();

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
  }


  /**
   * enable
   * @param  `selection`  A d3-selection to a `div` that the panel should render itself into
   */
  enable(selection) {
    if (this._enabled) return;

    this._enabled = true;
    this._selection = selection;

    this.context.map().on('drawn.info-measurement', this.render);
    this.context.on('enter.info-measurement', this.render);
  }


  /**
   * disable
   */
  disable() {
    if (!this._enabled) return;

    this._selection.html('');  // empty DOM

    this._enabled = false;
    this._selection = d3_select(null);

    this.context.map().on('drawn.info-measurement', null);
    this.context.on('enter.info-measurement', null);
  }


  /**
   * render
   */
  render() {
    if (!this._enabled) return;

    const selection = this._selection;
    const context = this.context;
    const graph = context.graph();
    const osm = services.osm;
    const localeCode = localizer.localeCode();

    // Empty out the DOM content and rebuild from scratch..
    selection.html('');

//    let selectedNoteID = context.selectedNoteID();

    let heading;
    let center, location, centroid;
    let closed, geometry;
    let totalNodeCount;
    let length = 0;
    let area = 0;
    let distance;

// select only OSM entities for now

//    if (selectedNoteID && osm) {       // selected 1 note
//      let note = osm.getNote(selectedNoteID);
//      heading = t('note.note') + ' ' + selectedNoteID;
//      location = note.loc;
//      geometry = 'note';
//
//    } else {    // selected 1..n entities

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
// there are bugs in here
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
//    }


    if (heading) {
      selection
        .append('h4')
        .attr('class', 'measurement-heading')
        .text(heading);
    }

    let list = selection.append('ul');
    let coordItem;

    if (geometry) {
      list
        .append('li')
        .html(t.html('info_panels.measurement.geometry') + ':')
        .append('span')
        .text(closed ? t('info_panels.measurement.closed_' + geometry) : t('geometry.' + geometry));
    }

    if (totalNodeCount) {
      list
        .append('li')
        .html(t.html('info_panels.measurement.node_count') + ':')
        .append('span')
        .text(totalNodeCount.toLocaleString(localeCode));
    }

    if (area) {
      list
        .append('li')
        .html(t.html('info_panels.measurement.area') + ':')
        .append('span')
        .text(displayArea(area, this._isImperial));
    }

    if (length) {
      list
        .append('li')
        .html(t.html('info_panels.measurement.' + (closed ? 'perimeter' : 'length')) + ':')
        .append('span')
        .text(displayLength(length, this._isImperial));
    }

    if (typeof distance === 'number') {
      list
        .append('li')
        .html(t.html('info_panels.measurement.distance') + ':')
        .append('span')
        .text(displayLength(distance, this._isImperial));
    }

    if (location) {
      coordItem = list
        .append('li')
        .html(t.html('info_panels.measurement.location') + ':');
      coordItem.append('span')
        .text(dmsCoordinatePair(location));
      coordItem.append('span')
        .text(decimalCoordinatePair(location));
    }

    if (centroid) {
      coordItem = list
        .append('li')
        .html(t.html('info_panels.measurement.centroid') + ':');
      coordItem.append('span')
        .text(dmsCoordinatePair(centroid));
      coordItem.append('span')
        .text(decimalCoordinatePair(centroid));
    }

    if (center) {
      coordItem = list
        .append('li')
        .html(t.html('info_panels.measurement.center') + ':');
      coordItem.append('span')
        .text(dmsCoordinatePair(center));
      coordItem.append('span')
        .text(decimalCoordinatePair(center));
    }

    // Add Imperial/Metric toggle
    if (length || area || typeof distance === 'number') {
      const toggle = this._isImperial ? 'imperial' : 'metric';
      selection
        .append('a')
        .html(t.html(`info_panels.measurement.${toggle}`))
        .attr('href', '#')
        .attr('class', 'button button-toggle-units')
        .on('click', e => {
          e.preventDefault();
          this._isImperial = !this._isImperial;
          this.render();
        });
    }
  }

}
