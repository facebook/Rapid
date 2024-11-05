import { selection } from 'd3-selection';
import { geoLength, geoCentroid } from 'd3-geo';
import { Extent, geoSphericalDistance } from '@rapid-sdk/math';
import { utilGetAllNodes } from '@rapid-sdk/util';

import { AbstractUiCard } from './AbstractUiCard.js';
import { QAItem } from '../../osm/index.js';
import { uiCmd } from '../cmd.js';
import { uiIcon } from '../icon.js';


// using WGS84 authalic radius (6371007.1809 m)
function radiansToMeters(r) {
  return r * 6371007.1809;
}

// http://gis.stackexchange.com/a/124857/40446
function steradiansToSqmeters(r) {
  return r / (4 * Math.PI) * 510065621724000;
}


function asLineString(feature) {
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
 * UiMeasurementCard
 */
export class UiMeasurementCard extends AbstractUiCard {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'measurement';

    const l10n = context.systems.l10n;
    const map = context.systems.map;

    this._isImperial = !l10n.isMetric();

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument

    // Event listeners
    map.on('draw', this.rerender);
    context.on('modechange', this.rerender);

    this.key = uiCmd('⌘⇧' + l10n.t('info_panels.measurement.key'));
    context.keybinding().on(this.key, this.toggle);
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders)
   * @param {d3-selection} $parent - A d3-selection to a HTMLElement that this component should render itself into
   */
  render($parent = this.$parent) {
    if ($parent instanceof selection) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    if (!this.visible) return;

    const context = this.context;
    const l10n = context.systems.l10n;
    const graph = context.systems.editor.staging.graph;
    const localeCode = l10n.localeCode();

    // .card-container
    let $wrap = $parent.selectAll('.card-container')
      .data([this.id], d => d);

    // enter
    const $$wrap = $wrap.enter()
      .append('div')
      .attr('class', d => `fillD2 card-container card-container-${d}`);

    const $$title = $$wrap
      .append('div')
      .attr('class', 'fillD2 card-title');

    $$title
      .append('h3');

    $$title
      .append('button')
      .attr('class', 'close')
      .on('click', this.toggle)
      .call(uiIcon('#rapid-icon-close'));

    $$wrap
      .append('div')
      .attr('class', d => `card-content card-content-${d}`);


    // update
    this.$wrap = $wrap = $wrap.merge($$wrap);

    $wrap.selectAll('h3')
      .text(l10n.t('info_panels.measurement.title'));


    // .card-content
    const $content = $wrap.selectAll('.card-content');

    // Empty out the DOM content and rebuild from scratch..
    $content.html('');

    let heading;
    let center, location, centroid;
    let closed, geometry;
    let totalNodeCount;
    let length = 0;
    let area = 0;
    let distance;

    const selectedIDs = context.selectedIDs();
    const selectedData = context.selectedData();
    const [selectedItem] = selectedData.values();  // first item
    const isNote = (selectedItem instanceof QAItem && selectedItem.service === 'osm');

    if (selectedData.size === 1 && isNote) {   // selected 1 OSM Note
      const note = selectedItem;
      heading = l10n.t('note.note') + ' ' + note.id;
      location = note.loc;
      geometry = 'note';

    } else {  // selected 0…n OSM Entities
      const selected = selectedIDs.map(id => graph.hasEntity(id)).filter(Boolean);

      if (selected.length === 1) {
        heading = selected[0].id;
      } else {
        heading = l10n.t('info_panels.selected', { n: selected.length });
      }

      if (selected.length > 0) {    // 1…n
        let allExtent = new Extent();

        selected.forEach(entity => {
          let extent = entity.extent(graph);
          let geojson = entity.asGeoJSON(graph);
          allExtent = allExtent.extend(extent);

          geometry = entity.geometry(graph);
          if (geometry === 'line' || geometry === 'area') {
            closed = (entity.type === 'relation') || (entity.isClosed() && !entity.isDegenerate());

            length += radiansToMeters(geoLength(asLineString(geojson)));

            centroid = geoCentroid(geojson);
            if (!centroid  || !isFinite(centroid[0]) || !isFinite(centroid[1])) {
              centroid = extent.center();
            }

            if (closed) {
              area += steradiansToSqmeters(entity.area(graph));
            }
          }
        });

        if (selected.length > 1) {  // 2…n
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
          totalNodeCount = utilGetAllNodes(selectedIDs, graph).length;
        }

        if (!location && !centroid) {
          center = allExtent.center();
        }
      }
    }


    if (heading) {
      $content
        .append('h4')
        .attr('class', 'measurement-heading')
        .text(heading);
    }

    let $list = $content.append('ul');
    let $item;

    if (geometry) {
      $list
        .append('li')
        .text(l10n.t('info_panels.measurement.geometry') + ':')
        .append('span')
        .text(closed ? l10n.t('info_panels.measurement.closed_' + geometry) : l10n.t('geometry.' + geometry));
    }

    if (totalNodeCount) {
      $list
        .append('li')
        .text(l10n.t('info_panels.measurement.node_count') + ':')
        .append('span')
        .text(totalNodeCount.toLocaleString(localeCode));
    }

    if (area) {
      $list
        .append('li')
        .text(l10n.t('info_panels.measurement.area') + ':')
        .append('span')
        .text(l10n.displayArea(area, this._isImperial));
    }

    if (length) {
      $list
        .append('li')
        .text(l10n.t('info_panels.measurement.' + (closed ? 'perimeter' : 'length')) + ':')
        .append('span')
        .text(l10n.displayLength(length, this._isImperial));
    }

    if (typeof distance === 'number') {
      $list
        .append('li')
        .text(l10n.t('info_panels.measurement.distance') + ':')
        .append('span')
        .text(l10n.displayLength(distance, this._isImperial));
    }

    if (location) {
      $item = $list
        .append('li')
        .text(l10n.t('info_panels.measurement.location') + ':');
      $item.append('span')
        .text(l10n.dmsCoordinatePair(location));
      $item.append('span')
        .text(l10n.decimalCoordinatePair(location));
    }

    if (centroid) {
      $item = $list
        .append('li')
        .text(l10n.t('info_panels.measurement.centroid') + ':');
      $item.append('span')
        .text(l10n.dmsCoordinatePair(centroid));
      $item.append('span')
        .text(l10n.decimalCoordinatePair(centroid));
    }

    if (center) {
      $item = $list
        .append('li')
        .text(l10n.t('info_panels.measurement.center') + ':');
      $item.append('span')
        .text(l10n.dmsCoordinatePair(center));
      $item.append('span')
        .text(l10n.decimalCoordinatePair(center));
    }

    // Add Imperial/Metric toggle
    if (length || area || typeof distance === 'number') {
      const toggle = this._isImperial ? 'imperial' : 'metric';
      $content
        .append('a')
        .text(l10n.t(`info_panels.measurement.${toggle}`))
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
