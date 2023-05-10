import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import _debounce from 'lodash-es/debounce';

import { t, localizer } from '../core/localizer';
import { actionChangePreset } from '../actions/change_preset';
import { operationDelete } from '../operations/delete';
import { uiIcon } from './icon';
import { uiTooltip } from './tooltip';
import { uiPresetIcon } from './preset_icon';
import { uiTagReference } from './tag_reference';
import { utilKeybinding, utilNoAuto, utilRebind, utilTotalExtent } from '../util';


export function uiPresetList(context) {
    var presetSystem = context.presetSystem();
    var dispatch = d3_dispatch('cancel', 'choose');
    var _entityIDs;
    var _currLoc;
    var _currentPresets;
    var _autofocus = false;


    function presetList(selection) {
        if (!_entityIDs) return;

        var presets = presetSystem.matchAllGeometry(entityGeometries());

        selection.html('');

        var messagewrap = selection
            .append('div')
            .attr('class', 'header fillL');

        var message = messagewrap
            .append('h3')
            .html(t.html('inspector.choose'));

        messagewrap
            .append('button')
            .attr('class', 'preset-choose')
            .on('click', function() { dispatch.call('cancel', this); })
            .call(uiIcon((localizer.textDirection() === 'rtl') ? '#rapid-icon-backward' : '#rapid-icon-forward'));


        var searchWrap = selection
            .append('div')
            .attr('class', 'search-header');

        searchWrap
            .call(uiIcon('#rapid-icon-search', 'pre-text'));

        var search = searchWrap
            .append('input')
            .attr('class', 'preset-search-input')
            .attr('placeholder', t('inspector.search'))
            .attr('type', 'search')
            .call(utilNoAuto)
            .on('keydown', initialKeydown)
            .on('keypress', keypress)
            .on('input', _debounce(inputevent));

        if (_autofocus) {
            search.node().focus();

            // Safari 14 doesn't always like to focus immediately,
            // so try again on the next pass
            setTimeout(function() {
                search.node().focus();
            }, 0);
        }

        var listWrap = selection
            .append('div')
            .attr('class', 'inspector-body');

        var list = listWrap
            .append('div')
            .attr('class', 'preset-list')
            .call(drawList, presetSystem.defaults(entityGeometries()[0], 36, !context.inIntro(), _currLoc));

        context.features().on('change.preset-list', updateForFeatureHiddenState);


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
                context.undo();
            } else if (!d3_event.ctrlKey && !d3_event.metaKey) {
                // don't check for delete/undo hack on future keydown events
                d3_select(this).on('keydown', keydown);
                keydown.call(this, d3_event);
            }
        }

        function keydown(d3_event) {
            // down arrow
            if (d3_event.keyCode === utilKeybinding.keyCodes['↓'] &&
                // if insertion point is at the end of the string
                search.node().selectionStart === search.property('value').length) {
                d3_event.preventDefault();
                d3_event.stopPropagation();
                // move focus to the first item in the preset list
                var buttons = list.selectAll('.preset-list-button');
                if (!buttons.empty()) buttons.nodes()[0].focus();
            }
        }

        function keypress(d3_event) {
            // enter
            var value = search.property('value');
            if (d3_event.keyCode === 13 && // ↩ Return
                value.length) {
                list.selectAll('.preset-list-item:first-child')
                    .each(function(d) { d.choose.call(this); });
            }
        }

        function inputevent() {
            var value = search.property('value');
            list.classed('filtered', value.length);

            var collection, messageText;
            if (value.length) {
                collection = presets.search(value, entityGeometries()[0], _currLoc);
                messageText = t('inspector.results', {
                    n: collection.array.length,
                    search: value
                });
            } else {
                collection = presetSystem.defaults(entityGeometries()[0], 36, !context.inIntro(), _currLoc);
                messageText = t('inspector.choose');
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

        let items = selection.selectAll('.preset-list-item')
          .data(arr, d => d.preset.id);

        items.order();  // make them match the order of `arr`

        items.exit()
          .remove();

        items.enter()
          .append('div')
          .attr('class', function(item) { return 'preset-list-item preset-' + item.preset.id.replace('/', '-'); })
          .classed('current', function(item) { return _currentPresets.indexOf(item.preset) !== -1; })
          .each(function(item) { d3_select(this).call(item); })
          .style('opacity', 0)
          .transition()
          .style('opacity', 1);

      updateForFeatureHiddenState();
    }


    function itemKeydown(d3_event) {
        // the actively focused item
        var item = d3_select(this.closest('.preset-list-item'));
        var parentItem = d3_select(item.node().parentNode.closest('.preset-list-item'));

        // arrow down, move focus to the next, lower item
        if (d3_event.keyCode === utilKeybinding.keyCodes['↓']) {
            d3_event.preventDefault();
            d3_event.stopPropagation();
            // the next item in the list at the same level
            var nextItem = d3_select(item.node().nextElementSibling);
            // if there is no next item in this list
            if (nextItem.empty()) {
                // if there is a parent item
                if (!parentItem.empty()) {
                    // the item is the last item of a sublist,
                    // select the next item at the parent level
                    nextItem = d3_select(parentItem.node().nextElementSibling);
                }
            // if the focused item is expanded
            } else if (d3_select(this).classed('expanded')) {
                // select the first subitem instead
                nextItem = item.select('.subgrid .preset-list-item:first-child');
            }
            if (!nextItem.empty()) {
                // focus on the next item
                nextItem.select('.preset-list-button').node().focus();
            }

        // arrow up, move focus to the previous, higher item
        } else if (d3_event.keyCode === utilKeybinding.keyCodes['↑']) {
            d3_event.preventDefault();
            d3_event.stopPropagation();
            // the previous item in the list at the same level
            var previousItem = d3_select(item.node().previousElementSibling);

            // if there is no previous item in this list
            if (previousItem.empty()) {
                // if there is a parent item
                if (!parentItem.empty()) {
                    // the item is the first subitem of a sublist select the parent item
                    previousItem = parentItem;
                }
            // if the previous item is expanded
            } else if (previousItem.select('.preset-list-button').classed('expanded')) {
                // select the last subitem of the sublist of the previous item
                previousItem = previousItem.select('.subgrid .preset-list-item:last-child');
            }

            if (!previousItem.empty()) {
                // focus on the previous item
                previousItem.select('.preset-list-button').node().focus();
            } else {
                // the focus is at the top of the list, move focus back to the search field
                var search = d3_select(this.closest('.preset-list-pane')).select('.preset-search-input');
                search.node().focus();
            }

        // arrow left, move focus to the parent item if there is one
        } else if (d3_event.keyCode === utilKeybinding.keyCodes[(localizer.textDirection() === 'rtl') ? '→' : '←']) {
            d3_event.preventDefault();
            d3_event.stopPropagation();
            // if there is a parent item, focus on the parent item
            if (!parentItem.empty()) {
                parentItem.select('.preset-list-button').node().focus();
            }

        // arrow right, choose this item
        } else if (d3_event.keyCode === utilKeybinding.keyCodes[(localizer.textDirection() === 'rtl') ? '←' : '→']) {
            d3_event.preventDefault();
            d3_event.stopPropagation();
            item.datum().choose.call(d3_select(this).node());
        }
    }


    function CategoryItem(preset) {
        var box, sublist, shown = false;

        function item(selection) {
            var wrap = selection.append('div')
                .attr('class', 'preset-list-button-wrap category');

            function click() {
                var isExpanded = d3_select(this).classed('expanded');
                var iconName = isExpanded ?
                    (localizer.textDirection() === 'rtl' ? '#rapid-icon-backward' : '#rapid-icon-forward') : '#rapid-icon-down';
                d3_select(this)
                    .classed('expanded', !isExpanded);
                d3_select(this).selectAll('div.label-inner svg.icon use')
                    .attr('href', iconName);
                item.choose();
            }

            var geometries = entityGeometries();

            var button = wrap
                .append('button')
                .attr('class', 'preset-list-button')
                .classed('expanded', false)
                .call(uiPresetIcon(context)
                    .geometry(geometries.length === 1 && geometries[0])
                    .preset(preset))
                .on('click', click)
                .on('keydown', function(d3_event) {
                    // right arrow, expand the focused item
                    if (d3_event.keyCode === utilKeybinding.keyCodes[(localizer.textDirection() === 'rtl') ? '←' : '→']) {
                        d3_event.preventDefault();
                        d3_event.stopPropagation();
                        // if the item isn't expanded
                        if (!d3_select(this).classed('expanded')) {
                            // toggle expansion (expand the item)
                            click.call(this, d3_event);
                        }
                    // left arrow, collapse the focused item
                    } else if (d3_event.keyCode === utilKeybinding.keyCodes[(localizer.textDirection() === 'rtl') ? '→' : '←']) {
                        d3_event.preventDefault();
                        d3_event.stopPropagation();
                        // if the item is expanded
                        if (d3_select(this).classed('expanded')) {
                            // toggle expansion (collapse the item)
                            click.call(this, d3_event);
                        }
                    } else {
                        itemKeydown.call(this, d3_event);
                    }
                });

            var label = button
                .append('div')
                .attr('class', 'label')
                .append('div')
                .attr('class', 'label-inner');

            label
                .append('div')
                .attr('class', 'namepart')
                .call(uiIcon((localizer.textDirection() === 'rtl' ? '#rapid-icon-backward' : '#rapid-icon-forward'), 'inline'))
                .append('span')
                .html(function() { return preset.nameLabel() + '&hellip;'; });

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
                var members = preset.members.matchAllGeometry(entityGeometries());
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


    function PresetItem(preset) {
        function item(selection) {
            var wrap = selection.append('div')
                .attr('class', 'preset-list-button-wrap');

            var geometries = entityGeometries();

            var button = wrap.append('button')
                .attr('class', 'preset-list-button')
                .call(uiPresetIcon(context)
                    .geometry(geometries.length === 1 && geometries[0])
                    .preset(preset))
                .on('click', item.choose)
                .on('keydown', itemKeydown);

            var label = button
                .append('div')
                .attr('class', 'label')
                .append('div')
                .attr('class', 'label-inner');

            var nameparts = [
                preset.nameLabel(),
                preset.subtitleLabel()
            ].filter(Boolean);

            label.selectAll('.namepart')
                .data(nameparts)
                .enter()
                .append('div')
                .attr('class', 'namepart')
                .html(function(d) { return d; });

            wrap.call(item.reference.button);
            selection.call(item.reference.body);
        }

        item.choose = function() {
            if (d3_select(this).classed('disabled')) return;
            if (!context.inIntro()) {
                presetSystem.setMostRecent(preset);
            }
            context.perform(
                function(graph) {
                    for (var i in _entityIDs) {
                        var entityID = _entityIDs[i];
                        var oldPreset = presetSystem.match(graph.entity(entityID), graph);
                        graph = actionChangePreset(entityID, oldPreset, preset)(graph);
                    }
                    return graph;
                },
                t('operations.change_tags.annotation')
            );

            context.validator().validate();  // rerun validation
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
        if (!_entityIDs.every(context.hasEntity)) return;

        var geometries = entityGeometries();
        var button = context.container().selectAll('.preset-list .preset-list-button');

        // remove existing tooltips
        button.call(uiTooltip().destroyAny);

        button.each(function(item, index) {
            var hiddenPresetFeaturesId;
            for (var i in geometries) {
                hiddenPresetFeaturesId = context.features().isHiddenPreset(item.preset, geometries[i]);
                if (hiddenPresetFeaturesId) break;
            }
            var isHiddenPreset = !context.inIntro() &&
                !!hiddenPresetFeaturesId &&
                (_currentPresets.length !== 1 || item.preset !== _currentPresets[0]);

            d3_select(this)
                .classed('disabled', isHiddenPreset);

            if (isHiddenPreset) {
                var isAutoHidden = context.features().autoHidden(hiddenPresetFeaturesId);
                d3_select(this).call(uiTooltip()
                    .title(t.html('inspector.hidden_preset.' + (isAutoHidden ? 'zoom' : 'manual'), {
                        features: t.html('feature.' + hiddenPresetFeaturesId + '.description')
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
            // calculate current location
            _currLoc = utilTotalExtent(_entityIDs, context.graph()).center();

            // match presets
            var presets = _entityIDs.map(function(entityID) {
                return presetSystem.match(context.entity(entityID), context.graph());
            });
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
        var counts = {};

        for (var i in _entityIDs) {
            var entityID = _entityIDs[i];
            var entity = context.entity(entityID);
            var geometry = entity.geometry(context.graph());

            // Treat entities on addr:interpolation lines as points, not vertices (#3241)
            if (geometry === 'vertex' && entity.isOnAddressLine(context.graph())) {
                geometry = 'point';
            }

            if (!counts[geometry]) counts[geometry] = 0;
            counts[geometry] += 1;
        }

        return Object.keys(counts).sort(function(geom1, geom2) {
            return counts[geom2] - counts[geom1];
        });
    }

    return utilRebind(presetList, dispatch, 'on');
}
