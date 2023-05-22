import { select as d3_select } from 'd3-selection';
import { styleMatch } from '../../../pixi/styles';
import * as PIXI from 'pixi.js';

import { Map } from '../../../3drenderer/Map';

import { t } from '../../../core/localizer';
import { uiCmd } from '../../cmd';

/*
 * ui3DMap is a ui panel containing a maplibre 3D Map for visualizing buildings, roads, and areas.
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
      // Since the bounds are intended to wrap a box around a perfectly orthogonal view,
      // for a pitched, isometric view we need to enlarge the box a bit to display more buildings.
      let extent = context.map().extent();
      let center = extent.center();
      extent.padByMeters(100);

      _map.map.jumpTo({
        center: center,
        bearing: 0,
        zoom: context.map().zoom() - 3,
      });
    }

    function featuresToGeoJSON() {
      let mainmap = context.map();
      const entities = context.history().intersects(mainmap.extent());
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
      const areaEnts = entities.filter((ent) => {
        const tags = Object.keys(ent.tags).filter(
          (tagname) =>
            tagname.startsWith('landuse') ||
            tagname.startsWith('leisure') ||
            tagname.startsWith('natural') ||
            tagname.startsWith('area')
        );
        return tags.length > 0;
      });
      generateRoadLayer(context, highwayEnts, _map);
      generateBuildingLayer(context, buildingEnts, _map);
      generateAreaLayer(context, areaEnts, _map);
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

    _map = new Map('3d-buildings', context); // container id
    context.map().on('draw', () => redraw());
    context.map().on('move', () => redraw());

    context.on('enter.3dmap', () => {
      featuresToGeoJSON();
    });
    context.history().on('change.3dmap', () => {
      featuresToGeoJSON();
    });

    redraw();

    context.keybinding().on([uiCmd('⌘' + t('background.3dmap.key'))], toggle);
  }

  return threeDMap;
}

function generateBuildingLayer(context, buildingEnts, _map) {
  let buildingFeatures = [];
  let selectedIDs = context.selectedIDs();
  for (const buildingEnt of buildingEnts) {
    let gj = buildingEnt.asGeoJSON(context.graph());
    if (gj.type !== 'Polygon' && gj.type !== 'MultiPolygon') continue;

    let newFeature = {
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

  const buildingSource = _map.map.getSource('osmbuildings');

  if (buildingSource) {
    buildingSource.setData({
      type: 'FeatureCollection',
      features: buildingFeatures,
    });
  }
}

function generateAreaLayer(context, areaEnts, _map) {
  let areaFeatures = [];
  let selectedIDs = context.selectedIDs();
  for (const areaEnt of areaEnts) {
    let gj = areaEnt.asGeoJSON(context.graph());
    if (gj.type !== 'Polygon' && gj.type !== 'MultiPolygon') continue;

    const style = styleMatch(areaEnt.tags);
    const fillColor = PIXI.utils.hex2string(style.fill.color);
    const strokeColor = PIXI.utils.hex2string(style.stroke.color);

    let newFeature = {
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

  const areaSource = _map.map.getSource('osmareas');

  if (areaSource) {
    areaSource.setData({
      type: 'FeatureCollection',
      features: areaFeatures,
    });
  }
}

function generateRoadLayer(context, roadEnts, _map) {
  let roadFeatures = [];
  let selectedIDs = context.selectedIDs();
  for (const roadEnt of roadEnts) {
    let gj = roadEnt.asGeoJSON(context.graph());
    if (gj.type !== 'LineString') continue;

    const style = styleMatch(roadEnt.tags);
    const casingColor = PIXI.utils.hex2string(style.casing.color);
    const strokeColor = PIXI.utils.hex2string(style.stroke.color);

    let newFeature = {
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

  const roadSource = _map.map.getSource('osmroads');

  if (roadSource) {
    roadSource.setData({
      type: 'FeatureCollection',
      features: roadFeatures,
    });
  }
}