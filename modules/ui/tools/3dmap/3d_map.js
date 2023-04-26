import { select as d3_select } from 'd3-selection';

import { Map } from '../../../3drenderer/Map';

import { t } from '../../../core/localizer';
import { uiCmd } from '../../cmd';

/*
 * ui3DMap is a ui panel containing a maplibre 3D Map for visualizing buildings.
 * @param {*} context
 * @returns
 */
export function ui3DMap(context) {
  function threeDMap(selection) {
    let wrap = d3_select(null);
    let _isHidden = true; // start out hidden
    let _map;

    function redraw() {
      if (_isHidden) return;
      updateProjection();
      featuresToGeoJSON();
    }

    function updateProjection() {
      let bounds = [context.map().extent().min, context.map().extent().max];
      _map.map.fitBounds((this.bounds = bounds));
    }

    function featuresToGeoJSON() {
      var mainmap = context.map();
      const entities = context.history().intersects(mainmap.extent());
      const buildingEnts = entities.filter((ent) => {
        const tags = Object.keys(ent.tags).filter((tagname) =>
          tagname.startsWith('building')
        );
        return tags.length > 0;
      });
      var features = [];
      var selectedFeatures = [];
      var selectedIDs = context.selectedIDs();
      for (const buildingEnt of buildingEnts) {

        var gj = buildingEnt.asGeoJSON(context.graph());
        if (gj.type !== 'Polygon') continue;

        let newFeature = {
          type: 'Feature',
          properties: {
            extrude: true,
            min_height: buildingEnt.tags.min_height
              ? parseFloat(buildingEnt.tags.min_height)
              : 0,
            height: parseFloat(
              buildingEnt.tags.height ||
                buildingEnt.tags['building:levels'] * 3 ||
                0
            ),
          },
          geometry: gj,
        }

        // We need to divy the buildings into different layers depending on how we want them styled.
        // unselected buildings look different from selected buildings, and must go into a separate layer.
        if (selectedIDs.includes(buildingEnt.id)) {
          selectedFeatures.push(newFeature);
        } else {
        features.push(newFeature);
        }
      }

      const buildingSource = _map.map.getSource('osmbuildings');

      if (buildingSource) {
        buildingSource.setData({
          type: 'FeatureCollection',
          features: features,
        });
      }
      const selectedBuildingSource = _map.map.getSource('osmselectedbuildings');

      if (selectedBuildingSource) {
        selectedBuildingSource.setData({
          type: 'FeatureCollection',
          features: selectedFeatures,
        });
      }

    }

    function toggle(d3_event) {
      if (d3_event) d3_event.preventDefault();

      _isHidden = !_isHidden;

      context
        .container()
        .select('.three-d-map-toggle-item')
        .classed('active', !_isHidden)
        .select('input')
        .property('checked', !_isHidden);

      if (_isHidden) {
        wrap
          .style('display', 'block')
          .style('opacity', '1')
          .transition()
          .duration(200)
          .style('opacity', '0')
          .on('end', () =>
            selection.selectAll('.three-d-map').style('display', 'none')
          );
      } else {
        wrap
          .style('display', 'block')
          .style('opacity', '0')
          .transition()
          .duration(200)
          .style('opacity', '1')
          .on('end', () => redraw());
      }
    }

    /* setup */
    ui3DMap.toggle = toggle;

    wrap = selection.selectAll('.three-d-map').data([0]);

    let wrapEnter = wrap
      .enter()
      .append('div')
      .attr('class', 'three-d-map')
      .attr('id', '3d-buildings')
      .style('display', _isHidden ? 'none' : 'block');

    wrap = wrapEnter.merge(wrap);

    _map = new Map('3d-buildings'); // container id
    context.map().on('draw', () => redraw());
    context.map().on('move', () => redraw());

    context.on('enter.3dmap', (e) => {
      featuresToGeoJSON();
    });
    context.history().on('change.3dmap', (e) => {
      featuresToGeoJSON();
    });

    redraw();

    context.keybinding().on([uiCmd('⌘' + t('background.3dmap.key'))], toggle);
  }

  return threeDMap;
}
