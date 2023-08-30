import { Color } from 'pixi.js';
import { select as d3_select } from 'd3-selection';

import { styleMatch } from '../pixi/styles';
import { uiCmd } from './cmd';

/*
 * uiMap3dViewer is a ui panel containing a maplibre 3D Map for visualizing buildings, roads, and areas.
 * @param {*} context
 * @returns
 */
export function uiMap3dViewer(context) {

  function render(selection) {
    let wrap = d3_select(null);
    let _isHidden = true; // start out hidden


    function redraw() {
      if (_isHidden) return;
      updateProjection();
      featuresToGeoJSON();
    }


    function updateProjection() {
      // Since the bounds are intended to wrap a box around a perfectly orthogonal view,
      // for a pitched, isometric view we need to enlarge the box a bit to display more buildings.
      let extent = context.systems.map.extent();
      let center = extent.center();
      extent.padByMeters(100);

      context.systems.map3d.maplibre.jumpTo({
        center: center,
        bearing: 0,
        zoom: context.systems.map.zoom() - 3,
      });
    }


    function featuresToGeoJSON() {
      let mainmap = context.systems.map;
      const entities = context.systems.edits.intersects(mainmap.extent());

      const buildingEnts = entities.filter((ent) => {
        const tags = Object.keys(ent.tags).filter((tagname) =>
          tagname.startsWith('building')
        );
        return tags.length > 0;
      });

      const highwayEnts = entities.filter((ent) => {
        const tags = Object.keys(ent.tags).filter((tagname) =>
          tagname.startsWith('highway')
        );
        return tags.length > 0;
      });

      const noRelationEnts = entities.filter((ent) => !ent.id.startsWith('r'));

      const areaEnts = noRelationEnts.filter((ent) => {
        const tags = Object.keys(ent.tags).filter(
          (tagname) =>
            tagname.startsWith('landuse') ||
            tagname.startsWith('leisure') ||
            tagname.startsWith('natural') ||
            tagname.startsWith('area')
        );
        return tags.length > 0;
      });

      generateRoadLayer(highwayEnts);
      generateBuildingLayer(buildingEnts);
      generateAreaLayer(areaEnts);
    }


    function generateBuildingLayer(buildingEnts) {
      let buildingFeatures = [];
      const selectedIDs = context.selectedIDs();

      for (const buildingEnt of buildingEnts) {
        const gj = buildingEnt.asGeoJSON(context.graph());
        if (gj.type !== 'Polygon' && gj.type !== 'MultiPolygon') continue;

        const newFeature = {
          type: 'Feature',
          properties: {
            extrude: true,
            selected: selectedIDs.includes(buildingEnt.id).toString(),
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
        };

        buildingFeatures.push(newFeature);
      }

      const maplibre = context.systems.map3d.maplibre;
      const buildingSource = maplibre?.getSource('osmbuildings');

      if (buildingSource) {
        buildingSource.setData({
          type: 'FeatureCollection',
          features: buildingFeatures,
        });
      }
    }


    function generateAreaLayer(areaEnts) {
      let areaFeatures = [];
      const selectedIDs = context.selectedIDs();

      for (const areaEnt of areaEnts) {
        let gj = areaEnt.asGeoJSON(context.graph());
        if (gj.type !== 'Polygon' && gj.type !== 'MultiPolygon') continue;

        const style = styleMatch(areaEnt.tags);
        const fillColor = new Color(style.fill.color).toHex();
        const strokeColor = new Color(style.stroke.color).toHex();

        const newFeature = {
          type: 'Feature',
          properties: {
            selected: selectedIDs.includes(areaEnt.id).toString(),
            fillcolor: fillColor,
            strokecolor: strokeColor,
          },
          geometry: gj,
        };

        areaFeatures.push(newFeature);
      }

      const maplibre = context.systems.map3d.maplibre;
      const areaSource = maplibre?.getSource('osmareas');

      if (areaSource) {
        areaSource.setData({
          type: 'FeatureCollection',
          features: areaFeatures,
        });
      }
    }


    function generateRoadLayer(roadEnts) {
      let roadFeatures = [];
      const selectedIDs = context.selectedIDs();

      for (const roadEnt of roadEnts) {
        const gj = roadEnt.asGeoJSON(context.graph());
        if (gj.type !== 'LineString') continue;

        const style = styleMatch(roadEnt.tags);
        const casingColor = new Color(style.casing.color).toHex();
        const strokeColor = new Color(style.stroke.color).toHex();

        const newFeature = {
          type: 'Feature',
          properties: {
            selected: selectedIDs.includes(roadEnt.id).toString(),
            highway: roadEnt.tags.highway,
            casingColor: casingColor,
            strokeColor: strokeColor,
          },
          geometry: gj,
        };

        roadFeatures.push(newFeature);
      }

      const maplibre = context.systems.map3d.maplibre;
      const roadSource = maplibre?.getSource('osmroads');

      if (roadSource) {
        roadSource.setData({
          type: 'FeatureCollection',
          features: roadFeatures,
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
    uiMap3dViewer.toggle = toggle;

    wrap = selection.selectAll('.three-d-map').data([0]);

    let wrapEnter = wrap
      .enter()
      .append('div')
      .attr('class', 'three-d-map')
      .attr('id', '3d-buildings')
      .style('display', _isHidden ? 'none' : 'block');

    wrap = wrapEnter.merge(wrap);
    context.systems.map3d.startAsync();

    context.systems.map.on('draw', () => redraw());
    context.systems.map.on('move', () => redraw());
    context.keybinding().on([uiCmd('⌘' + context.t('background.3dmap.key'))], toggle);

    redraw();
  }

  return render;
}

