import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import debounce from 'lodash-es/debounce';

import { actionChangePreset } from '../actions/change_preset';
import { operationDelete } from '../operations/delete';
import { uiIcon } from './icon';
import { uiTooltip } from './tooltip';
import { uiPresetIcon } from './preset_icon';
import { uiTagReference } from './tag_reference';
import { utilKeybinding, utilNoAuto, utilRebind, utilTotalExtent } from '../util';


export function uiPresetList(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const filters = context.systems.filters;
  const presetSystem = context.systems.presets;
  const dispatch = d3_dispatch('cancel', 'choose');

  let _entityIDs;
  let _currLoc;
  let _currentPresets;
  let _autofocus = false;


  function presetList(selection) {
    if (!_entityIDs) return;

    let presets = presetSystem.matchAllGeometry(entityGeometries());
    const isRTL = l10n.isRTL();

    selection.html('');

    const messagewrap = selection
      .append('div')
      .attr('class', 'header fillL');

    const message = messagewrap
      .append('h3')
      .html(l10n.tHtml('inspector.choose'));

    messagewrap
      .append('button')
      .attr('class', 'preset-choose')
      .on('click', function() { dispatch.call('cancel', this); })
      .call(uiIcon(isRTL ? '#rapid-icon-backward' : '#rapid-icon-forward'));


    const searchWrap = selection
      .append('div')
      .attr('class', 'search-header');

    searchWrap
      .call(uiIcon('#rapid-icon-search', 'pre-text'));

    const search = searchWrap
      .append('input')
      .attr('class', 'preset-search-input')
      .attr('placeholder', l10n.t('inspector.search'))
      .attr('type', 'search')
      .call(utilNoAuto)
      .on('keydown', initialKeydown)
      .on('keypress', keypress)
      .on('input', debounce(inputevent));

    if (_autofocus) {
      search.node().focus();

      // Safari 14 doesn't always like to focus immediately, so try again on the next pass
      setTimeout(() => {
        search.node().focus();
      }, 0);
    }

    const listWrap = selection
      .append('div')
      .attr('class', 'inspector-body');

    const list = listWrap
      .append('div')
      .attr('class', 'preset-list')
      .call(drawList, presetSystem.defaults(entityGeometries()[0], 36, !context.inIntro, _currLoc));

    filters.on('filterchange', updateForFeatureHiddenState);


    function initialKeydown(d3_event) {
      // hack to let delete shortcut work when search is autofocused
      if (search.property('value').length === 0 &&
        (d3_event.keyCode === utilKeybinding.keyCodes['⌫'] ||
         d3_event.keyCode === utilKeybinding.keyCodes['⌦'])) {
        d3_event.preventDefault();
        d3_event.stopPropagation();
        operationDelete(context, _entityIDs)();

      // hack to let undo work when search is autofocused
      } else if (search.property('value').length === 0 &&
        (d3_event.ctrlKey || d3_event.metaKey) &&
        d3_event.keyCode === utilKeybinding.keyCodes.z) {
        d3_event.preventDefault();
        d3_event.stopPropagation();
        editor.undo();

      } else if (!d3_event.ctrlKey && !d3_event.metaKey) {
        // don't check for delete/undo hack on future keydown events
        d3_select(this).on('keydown', keydown);
        keydown.call(this, d3_event);
      }
    }

    function keydown(d3_event) {
      if (d3_event.keyCode === utilKeybinding.keyCodes['↓'] &&       // down arrow
        // if insertion point is at the end of the string
        search.node().selectionStart === search.property('value').length
      ) {
        d3_event.preventDefault();
        d3_event.stopPropagation();
        // move focus to the first item in the preset list
        let buttons = list.selectAll('.preset-list-button');
        if (!buttons.empty()) {
          buttons.nodes()[0].focus();
        }
      }
    }

    function keypress(d3_event) {
      const value = search.property('value');
      if (d3_event.keyCode === 13 && value.length) {  // ↩ Return
        list.selectAll('.preset-list-item:first-child')
          .each(function(d) { d.choose.call(this); });
      }
    }

    function inputevent() {
      const value = search.property('value');
      list.classed('filtered', value.length);

      let collection, messageText;
      if (value.length) {
        collection = presets.search(value, entityGeometries()[0], _currLoc);
        messageText = l10n.t('inspector.results', { n: collection.array.length, search: value });
      } else {
        collection = presetSystem.defaults(entityGeometries()[0], 36, !context.inIntro, _currLoc);
        messageText = l10n.t('inspector.choose');
      }
      list.call(drawList, collection);
      message.html(messageText);
    }
  }


  // Draws a collection of Presets/Categories
  function drawList(selection, collection) {
    collection = collection.matchAllGeometry(entityGeometries());  // not sure why we do this again

    let arr = [];
    for (const item of collection.array) {
      if (!item) continue;  // not sure how this would happen
      if (item.members) {
        arr.push(CategoryItem(item));
      } else {
        arr.push(PresetItem(item));
      }
    }

    const items = selection.selectAll('.preset-list-item')
      .data(arr, d => d.preset.id);

    items.order();  // make them match the order of `arr`

    items.exit()
      .remove();

    items.enter()
      .append('div')
      .attr('class', d => 'preset-list-item preset-' + d.preset.id.replace('/', '-'))
      .classed('current', d => _currentPresets.includes(d.preset))
      .each(function(d) { d3_select(this).call(d); })
      .style('opacity', 0)
      .transition()
      .style('opacity', 1);

    updateForFeatureHiddenState();
  }


  function itemKeydown(d3_event) {
    // the actively focused item
    let item = d3_select(this.closest('.preset-list-item'));
    let parentItem = d3_select(item.node().parentNode.closest('.preset-list-item'));
    const isRTL = l10n.isRTL();

    // arrow down, move focus to the next, lower item
    if (d3_event.keyCode === utilKeybinding.keyCodes['↓']) {
      d3_event.preventDefault();
      d3_event.stopPropagation();

      // the next item in the list at the same level
      let nextItem = d3_select(item.node().nextElementSibling);
      // if there is no next item in this list
      if (nextItem.empty()) {
        if (!parentItem.empty()) {        // if there is a parent item
          // the item is the last item of a sublist, select the next item at the parent level
          nextItem = d3_select(parentItem.node().nextElementSibling);
        }
      } else if (d3_select(this).classed('expanded')) {                    // if the focused item is expanded
        nextItem = item.select('.subgrid .preset-list-item:first-child');  // select the first subitem instead
      }

      if (!nextItem.empty()) {
        nextItem.select('.preset-list-button').node().focus();    // focus on the next item
      }

    // arrow up, move focus to the previous, higher item
    } else if (d3_event.keyCode === utilKeybinding.keyCodes['↑']) {
      d3_event.preventDefault();
      d3_event.stopPropagation();

      // the previous item in the list at the same level
      let previousItem = d3_select(item.node().previousElementSibling);

      // if there is no previous item in this list
      if (previousItem.empty()) {
        if (!parentItem.empty()) {      // if there is a parent item
          previousItem = parentItem;    // the item is the first subitem of a sublist select the parent item
        }
      // if the previous item is expanded
      } else if (previousItem.select('.preset-list-button').classed('expanded')) {
        // select the last subitem of the sublist of the previous item
        previousItem = previousItem.select('.subgrid .preset-list-item:last-child');
      }

      if (!previousItem.empty()) {
        previousItem.select('.preset-list-button').node().focus();     // focus on the previous item
      } else {
        // the focus is at the top of the list, move focus back to the search field
        const search = d3_select(this.closest('.preset-list-pane')).select('.preset-search-input');
        search.node().focus();
      }

    // arrow left, move focus to the parent item if there is one
    } else if (d3_event.keyCode === utilKeybinding.keyCodes[isRTL ? '→' : '←']) {
      d3_event.preventDefault();
      d3_event.stopPropagation();
      if (!parentItem.empty()) {     // if there is a parent item, focus on the parent item
        parentItem.select('.preset-list-button').node().focus();
      }

    // arrow right, choose this item
    } else if (d3_event.keyCode === utilKeybinding.keyCodes[isRTL ? '←' : '→']) {
      d3_event.preventDefault();
      d3_event.stopPropagation();
      item.datum().choose.call(d3_select(this).node());
    }
  }


  /**
   */
  function CategoryItem(preset) {
    let box;
    let sublist;
    let shown = false;

    function item(selection) {
      const isRTL = l10n.isRTL();

      const wrap = selection.append('div')
        .attr('class', 'preset-list-button-wrap category');

      function click() {
        const isExpanded = d3_select(this).classed('expanded');
        const iconName = isExpanded ? (isRTL ? '#rapid-icon-backward' : '#rapid-icon-forward') : '#rapid-icon-down';
        d3_select(this)
          .classed('expanded', !isExpanded);
        d3_select(this).selectAll('div.label-inner svg.icon use')
          .attr('href', iconName);
        item.choose();
      }

      const geometries = entityGeometries();

      const button = wrap
        .append('button')
        .attr('class', 'preset-list-button')
        .classed('expanded', false)
        .call(uiPresetIcon(context)
          .geometry(geometries.length === 1 && geometries[0])
          .preset(preset))
        .on('click', click)
        .on('keydown', function(d3_event) {
          if (d3_event.keyCode === utilKeybinding.keyCodes[isRTL ? '←' : '→']) {  // right arrow, expand the focused item
            d3_event.preventDefault();
            d3_event.stopPropagation();
            if (!d3_select(this).classed('expanded')) {   // if the item isn't expanded
              click.call(this, d3_event);                 // toggle expansion (expand the item)
            }
          } else if (d3_event.keyCode === utilKeybinding.keyCodes[isRTL ? '→' : '←']) {   // left arrow, collapse the focused item
            d3_event.preventDefault();
            d3_event.stopPropagation();
            if (d3_select(this).classed('expanded')) {    // if the item is expanded
              click.call(this, d3_event);                 // toggle expansion (collapse the item)
            }
          } else {
            itemKeydown.call(this, d3_event);
          }
        });

      let label = button
        .append('div')
        .attr('class', 'label')
        .append('div')
        .attr('class', 'label-inner');

      label
        .append('div')
        .attr('class', 'namepart')
        .call(uiIcon((isRTL ? '#rapid-icon-backward' : '#rapid-icon-forward'), 'inline'))
        .append('span')
        .html(() => preset.nameLabel() + '&hellip;');

      box = selection.append('div')
        .attr('class', 'subgrid')
        .style('max-height', '0px')
        .style('opacity', 0);

      box.append('div')
        .attr('class', 'arrow');

      sublist = box.append('div')
        .attr('class', 'preset-list fillL3');
    }


    item.choose = function() {
      if (!box || !sublist) return;

      if (shown) {
        shown = false;
        box.transition()
          .duration(200)
          .style('opacity', '0')
          .style('max-height', '0px')
          .style('padding-bottom', '0px');
      } else {
        shown = true;
        const members = preset.members.matchAllGeometry(entityGeometries());
        sublist.call(drawList, members);
        box.transition()
          .duration(200)
          .style('opacity', '1')
          .style('max-height', 200 + members.array.length * 190 + 'px')
          .style('padding-bottom', '10px');
      }
    };

    item.preset = preset;
    return item;
  }


  /**
   */
  function PresetItem(preset) {
    function item(selection) {
      const wrap = selection.append('div')
        .attr('class', 'preset-list-button-wrap');

      const geometries = entityGeometries();

      const button = wrap.append('button')
        .attr('class', 'preset-list-button')
        .call(uiPresetIcon(context)
          .geometry(geometries.length === 1 && geometries[0])
          .preset(preset))
        .on('click', item.choose)
        .on('keydown', itemKeydown);

      const label = button
        .append('div')
        .attr('class', 'label')
        .append('div')
        .attr('class', 'label-inner');

      const nameparts = [
        preset.nameLabel(),
        preset.subtitleLabel()
      ].filter(Boolean);

      label.selectAll('.namepart')
        .data(nameparts)
        .enter()
        .append('div')
        .attr('class', 'namepart')
        .html(d => d);

      wrap.call(item.reference.button);
      selection.call(item.reference.body);
    }

    item.choose = function() {
      if (d3_select(this).classed('disabled')) return;
      if (!context.inIntro) {
        presetSystem.setMostRecent(preset);
      }

      const combinedAction = (graph) => {
        for (const entityID of _entityIDs) {
          const oldPreset = presetSystem.match(graph.entity(entityID), graph);
          graph = actionChangePreset(entityID, oldPreset, preset)(graph);
        }
        return graph;
      };

      editor.perform(combinedAction);
      editor.commit({
        annotation: l10n.t('operations.change_tags.annotation'),
        selectedIDs: _entityIDs
      });
      dispatch.call('choose', this, preset);
    };

    item.help = function(d3_event) {
      d3_event.stopPropagation();
      item.reference.toggle();
    };

    item.preset = preset;
    item.reference = uiTagReference(context, preset.reference());

    return item;
  }


  function updateForFeatureHiddenState() {
    const graph = editor.staging.graph;
    if (!_entityIDs.every(entityID => graph.hasEntity(entityID))) return;

    const geometries = entityGeometries();
    const buttons = context.container().selectAll('.preset-list .preset-list-button');

    // remove existing tooltips
    buttons.call(uiTooltip(context).destroyAny);

    buttons.each(function(item, index) {
      let hiddenPresetFeaturesId;
      for (let i in geometries) {
        hiddenPresetFeaturesId = filters.isHiddenPreset(item.preset, geometries[i]);
        if (hiddenPresetFeaturesId) break;
      }
      const isHiddenPreset = !context.inIntro && !!hiddenPresetFeaturesId &&
        (_currentPresets.length !== 1 || item.preset !== _currentPresets[0]);

      d3_select(this)
        .classed('disabled', isHiddenPreset);

      if (isHiddenPreset) {
        d3_select(this).call(uiTooltip(context)
          .title(l10n.tHtml('inspector.hidden_preset.manual', {
            features: l10n.tHtml('feature.' + hiddenPresetFeaturesId + '.description')
          }))
          .placement(index < 2 ? 'bottom' : 'top')
        );
      }
    });
  }


  presetList.autofocus = function(val) {
    if (!arguments.length) return _autofocus;
    _autofocus = val;
    return presetList;
  };


  presetList.entityIDs = function(val) {
    if (!arguments.length) return _entityIDs;

    _entityIDs = val;
    _currLoc = null;

    if (_entityIDs && _entityIDs.length) {
      const graph = editor.staging.graph;

      // calculate current location
      _currLoc = utilTotalExtent(_entityIDs, graph).center();

      // match presets
      let presets = _entityIDs.map(entityID => presetSystem.match(graph.entity(entityID), graph));
      presetList.presets(presets);
    }

    return presetList;
  };


  presetList.presets = function(val) {
    if (!arguments.length) return _currentPresets;
    _currentPresets = val;
    return presetList;
  };


  function entityGeometries() {
    const graph = editor.staging.graph;
    let counts = {};

    for (const entityID of _entityIDs) {
      const entity = graph.entity(entityID);
      let geometry = entity.geometry(graph);
      // Treat entities on addr:interpolation lines as points, not vertices (iD#3241)
      if (geometry === 'vertex' && entity.isOnAddressLine(graph)) {
        geometry = 'point';
      }

      if (!counts[geometry]) {
        counts[geometry] = 0;
      }

      counts[geometry] += 1;
    }

    return Object.keys(counts).sort((geom1, geom2) => counts[geom2] - counts[geom1]);
  }


  return utilRebind(presetList, dispatch, 'on');
}
