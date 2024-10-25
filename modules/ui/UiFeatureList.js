import { selection, select } from 'd3-selection';
import { Extent, geoSphericalDistance } from '@rapid-sdk/math';
import * as sexagesimal from '@mapbox/sexagesimal';

import { Graph } from '../core/lib/index.js';
import { osmEntity } from '../osm/entity.js';
import { uiIcon } from './icon.js';
import { uiCmd } from './cmd.js';
import { utilHighlightEntities, utilIsColorValid, utilNoAuto } from '../util/index.js';


/**
 * UiFeatureList
 * The feature list allows users to search for features and display the search results.
 *
 * @example
 *  <div class='feature-list-wrap'>
 *    <div class='header'/>           // Contains the text "Search Features"
 *    <div class='search-header'/>    // Contains the `input` search field
 *    <div class='inspector-body'/>   // Contains the search results
 *  </div>
 */
export class UiFeatureList {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this._geocodeResults = null;

    // D3 selections
    this.$parent = null;
    this.$featureList = null;
    this.$search = null;
    this.$list = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this._clearSearch = this._clearSearch.bind(this);
    this._click = this._click.bind(this);
    this._drawList = this._drawList.bind(this);
    this._focusSearch = this._focusSearch.bind(this);
    this._input = this._input.bind(this);
    this._keydown = this._keydown.bind(this);
    this._keypress = this._keypress.bind(this);
    this._mouseout = this._mouseout.bind(this);
    this._mouseover = this._mouseover.bind(this);
    this._nominatimSearch = this._nominatimSearch.bind(this);

    // Setup event listeners
    context.on('modechange', this._clearSearch);
//    context.systems.map
//     .on('drawn.feature-list', mapDrawn);

    const key = uiCmd('⌘F');
    context.keybinding().on(key, this._focusSearch);
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

    const context = this.context;
    const l10n = context.systems.l10n;

    // add .feature-list-wrap
    let $featureList = $parent.selectAll('.feature-list-wrap')
      .data([0]);

    const $$featureList = $featureList.enter()
      .append('div')
      .attr('class', 'feature-list-wrap inspector-hidden');  // UiSidebar will manage its visibility

    this.$featureList = $featureList = $featureList.merge($$featureList);


    // add .header
    $featureList.selectAll('.header')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'header fillL')
      .append('h3');

    // update
    $featureList.selectAll('.header h3')
      .text(l10n.t('inspector.feature_list'));


    // add .search-header
    const $$searchWrap = $featureList.selectAll('.search-header')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'search-header');

    $$searchWrap
      .call(uiIcon('#rapid-icon-search'));

    $$searchWrap
      .append('input')
      .attr('type', 'search')
      .call(utilNoAuto)
      .on('keypress', this._keypress)
      .on('keydown', this._keydown)
      .on('input', this._input);

    this.$search = $featureList.selectAll('.search-header input');

    // update
    this.$search
      .attr('placeholder', l10n.t('inspector.search'));


    // add .inspector-body and .feature-list
    $featureList.selectAll('.inspector-body')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'inspector-body')
      .append('div')
      .attr('class', 'feature-list');

    this.$list = $featureList.selectAll('.feature-list');

    // update
    this._drawList();
  }


  /*
   * _drawList
   * redraw the results list
   */
  _drawList() {
    if (!this.$search || !this.$list) return;  // called too early?

    const context = this.context;
    const l10n = context.systems.l10n;
    const nominatim = context.services.nominatim;

    const value = this.$search.property('value');
    const results = this._getSearchResults();

    const $list = this.$list;
    $list.classed('filtered', value.length);

    let $$resultsItem = $list.selectAll('.no-results-item')
      .data([0])
      .enter()
      .append('button')
      .property('disabled', true)
      .attr('class', 'no-results-item')
      .call(uiIcon('#rapid-icon-alert', 'pre-text'));

    $$resultsItem.append('span')
      .attr('class', 'entity-name');

    $list.selectAll('.no-results-item .entity-name')
      .text(l10n.t('geocoder.no_results_worldwide'));

    if (nominatim) {
      $list.selectAll('.geocode-item')
        .data([0])
        .enter()
        .append('button')
        .attr('class', 'geocode-item secondary-action')
        .on('click', this._nominatimSearch)
        .append('div')
        .attr('class', 'label')
        .append('span')
        .attr('class', 'entity-name')
        .text(l10n.t('geocoder.search'));
    }

    $list.selectAll('.no-results-item')
      .style('display', (value.length && !results.length) ? 'block' : 'none');

    $list.selectAll('.geocode-item')
      .style('display', (value && this._geocodeResults === undefined) ? 'block' : 'none');

    $list.selectAll('.feature-list-item')
      .data([-1])
      .remove();

    let $items = $list.selectAll('.feature-list-item')
      .data(results, d => d.id);

    let $$items = $items.enter()
      .insert('button', '.geocode-item')
      .attr('class', 'feature-list-item')
      .on('mouseover', this._mouseover)
      .on('mouseout', this._mouseout)
      .on('click', this._click);

    let $$label = $$items
      .append('div')
      .attr('class', 'label');

    $$label
      .each((d, i, nodes) => {
        select(nodes[i])
          .call(uiIcon(`#rapid-icon-${d.geometry}`, 'pre-text'));
      });

    $$label
      .append('span')
      .attr('class', 'entity-type')
      .text(d => d.type);

    $$label
      .append('span')
      .attr('class', 'entity-name')
      .classed('has-color', d => !!this._getColor(d.entity))
      .style('border-color', d => this._getColor(d.entity))
      .text(d => d.name);

    $$items
      .style('opacity', 0)
      .transition()
      .style('opacity', 1);

    $items.order();

    $items.exit()
      .remove();
  }


  /*
   * _focusSearch
   * Handler for the ⌘F shortcut to focus the search input
   * @param {KeyboardEvent}  e? - the keypress event (if any)
   */
  _focusSearch(e) {
    if (!this.$search) return;  // called too early?
    if (this.context.mode?.id !== 'browse') return;

    e?.preventDefault();
    this.$search.node().focus();
  }


  /*
   * _keydown
   * Handler for keydown event - unfocus the search if user presses `Escape`
   * @param {KeyboardEvent}  e - the keydown event
   */
  _keydown(e) {
    if (!this.$search) return;  // called too early?

    if (e.keyCode === 27) {  // escape
      this.$search.node().blur();
    }
  }


  /*
   * _keypress
   * Handler for keypress events
   * @param {KeyboardEvent}  e - the keypress event
   */
  _keypress(e) {
    if (!this.$search || !this.$list) return;  // called too early?

    const q = this.$search.property('value');
    const $items = this.$list.selectAll('.feature-list-item');
    if (e.keyCode === 13 && q.length && $items.size()) {  // ↩ Return
      this._click(e, $items.datum());
    }
  }


  /*
   * _input
   * Handler for input events - on typing redraw the list
   */
  _input() {
    this._geocodeResults = undefined;
    this._drawList();
  }


  /*
   * _clearSearch
   */
  _clearSearch() {
    if (!this.$search) return;  // called too early?

    this.$search.property('value', '');
    this._drawList();
  }


  /*
   * _getColor
   * If this entity has a color (e.g. a transit route)
   * @param   {Entity}  entity - The OSM Entity to check
   * @result  {string?}  The color string, if any
   */
  _getColor(entity) {
    const val = entity?.type === 'relation' && entity?.tags.colour;
    return (val && utilIsColorValid(val)) ? val : null;
  }


  /*
   * _mouseover
   * Handler for mouseover events on the list items
   * @param  {MouseEvent}  e - the mouseover event
   * @param  {Object}      d - data bound to the list item
   */
  _mouseover(e, d) {
    if (!d.id || d.id === -1) return;
    utilHighlightEntities([d.id], true, this.context);
  }


  /*
   * _mouseout
   * Handler for mouseout events on the list items
   * @param  {MouseEvent}  e - the mouseout event
   * @param  {Object}      d - data bound to the list item
   */
  _mouseout(e, d) {
    if (!d.id || d.id === -1) return;
    utilHighlightEntities([d.id], false, this.context);
  }


  /*
   * _click
   * Handler for click events on the list items,
   * may also be called by the keypress handler
   * @param  {Event}  e - the click or keypress event
   * @param  {Object} d - data bound to the list item
   */
  _click(e, d) {
    e.preventDefault();

    const context = this.context;
    const map = context.systems.map;
    const osm = context.services.osm;
    const scene = context.systems.gfx.scene;

    if (d.location) {
      map.centerZoomEase([d.location[1], d.location[0]], 19);

    } else if (d.id !== -1) {  // looks like an OSM Entity
      utilHighlightEntities([d.id], false, context);
      map.selectEntityID(d.id, true);   // select and fit , download first if necessary

    } else if (osm && d.noteID) {  // looks like an OSM Note
      const selectNote = (note) => {
        scene.enableLayers('notes');
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


  /*
   * _nominatimSearch
   * Search Nominatim, then display those results
   */
  _nominatimSearch() {
    if (!this.$search) return;  // called too early?

    const nominatim = this.context.services.nominatim;
    if (!nominatim) return;

    const q = this.$search.property('value');

    nominatim.search(q, (err, results) => {
      this._geocodeResults = results || [];
      this._drawList();
    });
  }


//   _mapDrawn(e) {
//    if (e.full) {
//      this._drawList();
//    }
//  }


  /*
   * _getSearchResults
   * This does the search
   * @return {Array<Object>}  Array of search results
   */
  _getSearchResults() {
    if (!this.$search) return;  // called too early?

    const context = this.context;
    const editor = context.systems.editor;
    const l10n = context.systems.l10n;
    const presets = context.systems.presets;

    const centerLoc = context.viewport.centerLoc();
    const q = this.$search.property('value').toLowerCase();
    let results = [];

    if (!q) return results;

    // User typed something that looks like a coordinate pair
    const locationMatch = sexagesimal.pair(q.toUpperCase()) || l10n.dmsMatcher(q);
    if (locationMatch) {
      const loc = [ parseFloat(locationMatch[0]), parseFloat(locationMatch[1]) ];
      results.push({
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
        results.push({
          id: -1,
          noteID: entityID,
          geometry: 'note',
          type: l10n.t('note.note'),
          name: entityID
        });
      } else {
        results.push({
          id: entityType + entityID,
          geometry: entityType === 'n' ? 'point' : entityType === 'w' ? 'line' : 'relation',
          type: l10n.displayType(entityType),
          name: entityID
        });
      }
    }

    // Search for what the user typed in the local and base graphs
    // Gather affected ids
    const graph = editor.staging.graph;
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
    results = results.concat(localResults);


    // Search for what the user typed in geocode results
    for (const d of (this._geocodeResults || [])) {
      if (!d.osm_type || !d.osm_id) continue;    // some results may be missing these - iD#1890

      // Make a temporary osmEntity so we can preset match and better localize the search result - iD#4725
      const id = osmEntity.id.fromOSM(d.osm_type, d.osm_id);
      const tags = {};
      tags[d.class] = d.type;

      const attrs = { id: id, type: d.osm_type, tags: tags };
      if (d.osm_type === 'way') {   // for ways, add some fake closed nodes
        attrs.nodes = ['a','a'];    // so that geometry area is possible
      }

      const tempEntity = osmEntity(attrs);
      const tempGraph = new Graph([tempEntity]);
      const preset = presets.match(tempEntity, tempGraph);
      const type = (preset && preset.name()) || l10n.displayType(id);

      results.push({
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
      results.push({
        id: 'n' + q,
        geometry: 'point',
        type: l10n.t('inspector.node'),
        name: q
      });
      results.push({
        id: 'w' + q,
        geometry: 'line',
        type: l10n.t('inspector.way'),
        name: q
      });
      results.push({
        id: 'r' + q,
        geometry: 'relation',
        type: l10n.t('inspector.relation'),
        name: q
      });
      results.push({
        id: -1,
        noteID: q,
        geometry: 'note',
        type: l10n.t('note.note'),
        name: q
      });
    }

    return results;
  }

}
