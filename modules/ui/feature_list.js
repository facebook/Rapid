import { select as d3_select } from 'd3-selection';
import { Extent, geoSphericalDistance } from '@rapid-sdk/math';
import * as sexagesimal from '@mapbox/sexagesimal';

import { Graph } from '../core/lib/index.js';
import { osmEntity } from '../osm/entity.js';
import { uiIcon } from './icon.js';
import { uiCmd } from './cmd.js';
import { utilHighlightEntities, utilIsColorValid, utilNoAuto } from '../util/index.js';


export function uiFeatureList(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const osm = context.services.osm;
  const nominatim = context.services.nominatim;
  const presets = context.systems.presets;

  let _geocodeResults;


  function featureList(selection) {
    let header = selection
      .append('div')
      .attr('class', 'header fillL');

    header
      .append('h3')
      .text(l10n.t('inspector.feature_list'));

    let searchWrap = selection
      .append('div')
      .attr('class', 'search-header');

    searchWrap
      .call(uiIcon('#rapid-icon-search'));

    let search = searchWrap
      .append('input')
      .attr('placeholder', l10n.t('inspector.search'))
      .attr('type', 'search')
      .call(utilNoAuto)
      .on('keypress', keypress)
      .on('keydown', keydown)
      .on('input', inputevent);

    let listWrap = selection
      .append('div')
      .attr('class', 'inspector-body');

    let list = listWrap
      .append('div')
      .attr('class', 'feature-list');

    context
      .on('modechange', clearSearch);
//    context.systems.map
//     .on('drawn.feature-list', mapDrawn);

    const key = uiCmd('⌘F');
    context.keybinding().off(key);
    context.keybinding().on(key, focusSearch);


    function focusSearch(d3_event) {
      if (context.mode?.id !== 'browse') return;
      d3_event.preventDefault();
      search.node().focus();
    }


    function keydown(d3_event) {
      if (d3_event.keyCode === 27) {  // escape
        search.node().blur();
      }
    }


    function keypress(d3_event) {
      const q = search.property('value');
      const items = list.selectAll('.feature-list-item');
      if (d3_event.keyCode === 13 && q.length && items.size()) {  // ↩ Return
        click(d3_event, items.datum());
      }
    }


    function inputevent() {
      _geocodeResults = undefined;
      drawList();
    }


    function clearSearch() {
      search.property('value', '');
      drawList();
    }


//    function mapDrawn(e) {
//      if (e.full) {
//        drawList();
//      }
//    }


    function features() {
      const graph = editor.staging.graph;
      const centerLoc = context.viewport.centerLoc();
      const q = search.property('value').toLowerCase();
      let result = [];

      if (!q) return result;

      // User typed something that looks like a coordinate pair
      const locationMatch = sexagesimal.pair(q.toUpperCase()) || l10n.dmsMatcher(q);
      if (locationMatch) {
        const loc = [ parseFloat(locationMatch[0]), parseFloat(locationMatch[1]) ];
        result.push({
          id: -1,
          geometry: 'point',
          type: l10n.t('inspector.location'),
          name: l10n.dmsCoordinatePair([loc[1], loc[0]]),
          location: loc
        });
      }

      // User typed something that looks like an OSM entity id (node/way/relation/note)
      const idMatch = !locationMatch && q.match(/(?:^|\W)(node|way|relation|note|[nwr])\W?0*([1-9]\d*)(?:\W|$)/i);
      if (idMatch) {
        const entityType = idMatch[1].charAt(0);  // n,w,r
        const entityID = idMatch[2];

        if (idMatch[1] === 'note') {
          result.push({
            id: -1,
            noteID: entityID,
            geometry: 'note',
            type: l10n.t('note.note'),
            name: entityID
          });
        } else {
          result.push({
            id: entityType + entityID,
            geometry: entityType === 'n' ? 'point' : entityType === 'w' ? 'line' : 'relation',
            type: l10n.displayType(entityType),
            name: entityID
          });
        }
      }

      // Search for what the user typed in the local and base graphs
      // Gather affected ids
      const base = graph.base.entities;
      const local = graph.local.entities;
      const ids = new Set([...base.keys(), ...local.keys()]);

      let localResults = [];
      for (let id of ids) {
        if (local.has(id) && local.get(id) === undefined) continue;  // deleted locally
        const entity = graph.hasEntity(id);
        if (!entity) continue;

        const name = l10n.displayName(entity.tags) || '';
        if (name.toLowerCase().indexOf(q) < 0) continue;

        const matched = presets.match(entity, graph);
        const type = (matched && matched.name()) || l10n.displayType(entity.id);
        const extent = entity.extent(graph);
        const distance = extent ? geoSphericalDistance(centerLoc, extent.center()) : 0;

        localResults.push({
          id: entity.id,
          entity: entity,
          geometry: entity.geometry(graph),
          type: type,
          name: name,
          distance: distance
        });

        if (localResults.length > 100) break;
      }

      localResults = localResults.sort((a, b) => a.distance - b.distance);
      result = result.concat(localResults);


      // Search for what the user typed in geocode results
      for (const d of (_geocodeResults || [])) {
        if (!d.osm_type || !d.osm_id) continue;    // some results may be missing these - iD#1890

        // Make a temporary osmEntity so we can preset match and better localize the search result - iD#4725
        const id = osmEntity.id.fromOSM(d.osm_type, d.osm_id);
        let tags = {};
        tags[d.class] = d.type;

        let attrs = { id: id, type: d.osm_type, tags: tags };
        if (d.osm_type === 'way') {   // for ways, add some fake closed nodes
          attrs.nodes = ['a','a'];    // so that geometry area is possible
        }

        const tempEntity = osmEntity(attrs);
        const tempGraph = new Graph([tempEntity]);
        const preset = presets.match(tempEntity, tempGraph);
        const type = (preset && preset.name()) || l10n.displayType(id);

        result.push({
          id: tempEntity.id,
          geometry: tempEntity.geometry(tempGraph),
          type: type,
          name: d.display_name,
          extent: new Extent(
            [ parseFloat(d.boundingbox[3]), parseFloat(d.boundingbox[0]) ],
            [ parseFloat(d.boundingbox[2]), parseFloat(d.boundingbox[1]) ]
          )
        });
      }

      // If the user just typed a number, offer them some OSM IDs
      if (q.match(/^[0-9]+$/)) {
        result.push({
          id: 'n' + q,
          geometry: 'point',
          type: l10n.t('inspector.node'),
          name: q
        });
        result.push({
          id: 'w' + q,
          geometry: 'line',
          type: l10n.t('inspector.way'),
          name: q
        });
        result.push({
          id: 'r' + q,
          geometry: 'relation',
          type: l10n.t('inspector.relation'),
          name: q
        });
        result.push({
          id: -1,
          noteID: q,
          geometry: 'note',
          type: l10n.t('note.note'),
          name: q
        });
      }

      return result;
    }


    function drawList() {
      const value = search.property('value');
      const results = features();

      list.classed('filtered', value.length);

      let resultsIndicator = list.selectAll('.no-results-item')
        .data([0])
        .enter()
        .append('button')
        .property('disabled', true)
        .attr('class', 'no-results-item')
        .call(uiIcon('#rapid-icon-alert', 'pre-text'));

      resultsIndicator.append('span')
        .attr('class', 'entity-name');

      list.selectAll('.no-results-item .entity-name')
        .text(l10n.t('geocoder.no_results_worldwide'));

      if (nominatim) {
        list.selectAll('.geocode-item')
          .data([0])
          .enter()
          .append('button')
          .attr('class', 'geocode-item secondary-action')
          .on('click', nominatimSearch)
          .append('div')
          .attr('class', 'label')
          .append('span')
          .attr('class', 'entity-name')
          .text(l10n.t('geocoder.search'));
      }

      list.selectAll('.no-results-item')
        .style('display', (value.length && !results.length) ? 'block' : 'none');

      list.selectAll('.geocode-item')
        .style('display', (value && _geocodeResults === undefined) ? 'block' : 'none');

      list.selectAll('.feature-list-item')
        .data([-1])
        .remove();

      let items = list.selectAll('.feature-list-item')
        .data(results, d => d.id);

      let enter = items.enter()
        .insert('button', '.geocode-item')
        .attr('class', 'feature-list-item')
        .on('mouseover', mouseover)
        .on('mouseout', mouseout)
        .on('click', click);

      let label = enter
        .append('div')
        .attr('class', 'label');

      label
        .each((d, i, nodes) => {
          d3_select(nodes[i])
            .call(uiIcon(`#rapid-icon-${d.geometry}`, 'pre-text'));
        });

      label
        .append('span')
        .attr('class', 'entity-type')
        .text(d => d.type);

      label
        .append('span')
        .attr('class', 'entity-name')
        .classed('has-color', d => !!_getColor(d.entity))
        .style('border-color', d => _getColor(d.entity))
        .text(d => d.name);

      enter
        .style('opacity', 0)
        .transition()
        .style('opacity', 1);

      items.order();

      items.exit()
        .remove();
    }


    function _getColor(entity) {
      const val = entity?.type === 'relation' && entity?.tags.colour;
      return (val && utilIsColorValid(val)) ? val : null;
    }


    function mouseover(d3_event, d) {
      if (!d.id || d.id === -1) return;
      utilHighlightEntities([d.id], true, context);
    }


    function mouseout(d3_event, d) {
      if (!d.id || d.id === -1) return;
      utilHighlightEntities([d.id], false, context);
    }


    function click(d3_event, d) {
      d3_event.preventDefault();

      if (d.location) {
        map.centerZoomEase([d.location[1], d.location[0]], 19);

      } else if (d.id !== -1) {  // looks like an OSM ID
        utilHighlightEntities([d.id], false, context);
        map.selectEntityID(d.id, true);   // select and fit , download first if necessary

      } else if (osm && d.noteID) {
        const selectNote = (note) => {
          map.scene.enableLayers('notes');
          map.centerZoomEase(note.loc, 19);
          const selection = new Map().set(note.id, note);
          context.enter('select', { selection: selection });
        };

        let note = osm.getNote(d.noteID);
        if (note) {
          selectNote(note);
        } else {
          osm.loadNote(d.noteID, (err) => {
            if (err) return;
            note = osm.getNote(d.noteID);
            if (note) {
              selectNote(note);
            }
          });
        }
      }
    }


    function nominatimSearch() {
      nominatim.search(search.property('value'), (err, results) => {
        _geocodeResults = results || [];
        drawList();
      });
    }
  }


  return featureList;
}
