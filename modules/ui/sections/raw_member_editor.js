import { drag as d3_drag } from 'd3-drag';
import { select as d3_select } from 'd3-selection';
import { utilUniqueString } from '@rapid-sdk/util';

import { actionChangeMember } from '../../actions/change_member';
import { actionDeleteMember } from '../../actions/delete_member';
import { actionMoveMember } from '../../actions/move_member';
import { modeSelect } from '../../modes/select';
import { osmEntity } from '../../osm';
import { uiIcon } from '../icon';
import { uiCombobox } from '../combobox';
import { uiSection } from '../section';
import { utilHighlightEntities, utilNoAuto } from '../../util';

const MAX_MEMBERS = 1000;


export function uiSectionRawMemberEditor(context) {
    const l10n = context.localizationSystem();

    var section = uiSection('raw-member-editor', context)
        .shouldDisplay(function() {
            if (!_entityIDs || _entityIDs.length !== 1) return false;

            var entity = context.hasEntity(_entityIDs[0]);
            return entity && entity.type === 'relation';
        })
        .label(function() {
            var entity = context.hasEntity(_entityIDs[0]);
            if (!entity) return '';

            var gt = entity.members.length > MAX_MEMBERS ? '>' : '';
            var count = gt + entity.members.slice(0, MAX_MEMBERS).length;
            return l10n.t('inspector.title_count', { title: l10n.tHtml('inspector.members'), count: count });
        })
        .disclosureContent(renderDisclosureContent);

    var taginfo = context.services.get('taginfo');
    var _entityIDs;

    function downloadMember(d3_event, d) {
        d3_event.preventDefault();

        // display the loading indicator
        d3_select(this.parentNode).classed('tag-reference-loading', true);
        context.loadEntity(d.id, function() {
            section.reRender();
        });
    }

    function zoomToMember(d3_event, d) {
        d3_event.preventDefault();

        var entity = context.entity(d.id);
        context.mapSystem().zoomToEase(entity);

        // highlight the feature in case it wasn't previously on-screen
        utilHighlightEntities([d.id], true, context);
    }


    function selectMember(d3_event, d) {
        d3_event.preventDefault();

        // remove the hover-highlight styling
        utilHighlightEntities([d.id], false, context);

        var entity = context.entity(d.id);
        var mapExtent = context.mapSystem().extent();
        if (!entity.intersects(mapExtent, context.graph())) {
            // zoom to the entity if its extent is not visible now
            context.mapSystem().zoomToEase(entity);
        }

        context.enter(modeSelect(context, [d.id]));
    }


    function changeRole(d3_event, d) {
        var oldRole = d.role;
        var newRole = context.cleanRelationRole(d3_select(this).property('value'));

        if (oldRole !== newRole) {
            var member = { id: d.id, type: d.type, role: newRole };
            context.perform(
                actionChangeMember(d.relation.id, member, d.index),
                l10n.t('operations.change_role.annotation', { n: 1 })
            );
            context.validationSystem().validate();
        }
    }


    function deleteMember(d3_event, d) {
        utilHighlightEntities([d.id], false, context);  // remove the hover-highlight styling

        context.perform(
            actionDeleteMember(d.relation.id, d.index),
            l10n.t('operations.delete_member.annotation', { n: 1 })
        );

        if (!context.hasEntity(d.relation.id)) {
            // Removing the last member will also delete the relation.
            // If this happens we need to exit the selection mode
            context.enter('browse');
        } else {
            // Changing the mode also runs `validate`, but otherwise we need to
            // rerun it manually
            context.validationSystem().validate();
        }
    }

    function renderDisclosureContent(selection) {
        var entityID = _entityIDs[0];
        var memberships = [];
        var entity = context.entity(entityID);
        entity.members.slice(0, MAX_MEMBERS).forEach(function(member, index) {
            memberships.push({
                index: index,
                id: member.id,
                type: member.type,
                role: member.role,
                relation: entity,
                member: context.hasEntity(member.id),
                uid: utilUniqueString(entityID + '-member-' + index)
            });
        });

        var list = selection.selectAll('.member-list')
            .data([0]);

        list = list.enter()
            .append('ul')
            .attr('class', 'member-list')
            .merge(list);


        var items = list.selectAll('li')
            .data(memberships, function(d) {
                return osmEntity.key(d.relation) + ',' + d.index + ',' +
                    (d.member ? osmEntity.key(d.member) : 'incomplete');
            });

        items.exit()
            .each(unbind)
            .remove();

        var itemsEnter = items.enter()
            .append('li')
            .attr('class', 'member-row form-field')
            .classed('member-incomplete', function(d) { return !d.member; });

        itemsEnter
            .each(function(d) {
                var item = d3_select(this);

                var label = item
                    .append('label')
                    .attr('class', 'field-label')
                    .attr('for', d.uid);

                if (d.member) {
                    // highlight the member feature in the map while hovering on the list item
                    item
                        .on('mouseover', function() {
                            utilHighlightEntities([d.id], true, context);
                        })
                        .on('mouseout', function() {
                            utilHighlightEntities([d.id], false, context);
                        });

                    var labelLink = label
                        .append('span')
                        .attr('class', 'label-text')
                        .append('a')
                        .attr('href', '#')
                        .on('click', selectMember);

                    labelLink
                        .append('span')
                        .attr('class', 'member-entity-type')
                        .html(function(d) {
                            var matched = context.presetSystem().match(d.member, context.graph());
                            return (matched && matched.name()) || l10n.displayType(d.member.id);
                        });

                    labelLink
                        .append('span')
                        .attr('class', 'member-entity-name')
                        .html(function(d) { return l10n.displayName(d.member); });

                    label
                        .append('button')
                        .attr('title', l10n.t('icons.remove'))
                        .attr('class', 'remove member-delete')
                        .call(uiIcon('#rapid-operation-delete'));

                    label
                        .append('button')
                        .attr('class', 'member-zoom')
                        .attr('title', l10n.t('icons.zoom_to'))
                        .call(uiIcon('#rapid-icon-framed-dot', 'monochrome'))
                        .on('click', zoomToMember);

                } else {
                    var labelText = label
                        .append('span')
                        .attr('class', 'label-text');

                    labelText
                        .append('span')
                        .attr('class', 'member-entity-type')
                        .html(l10n.tHtml('inspector.' + d.type, { id: d.id }));

                    labelText
                        .append('span')
                        .attr('class', 'member-entity-name')
                        .html(l10n.tHtml('inspector.incomplete', { id: d.id }));

                    label
                        .append('button')
                        .attr('class', 'member-download')
                        .attr('title', l10n.t('icons.download'))
                        .call(uiIcon('#rapid-icon-load'))
                        .on('click', downloadMember);
                }
            });

        var wrapEnter = itemsEnter
            .append('div')
            .attr('class', 'form-field-input-wrap form-field-input-member');

        wrapEnter
            .append('input')
            .attr('class', 'member-role')
            .attr('id', d => d.uid)
            .property('type', 'text')
            .attr('placeholder', l10n.t('inspector.role'))
            .call(utilNoAuto);

        if (taginfo) {
            wrapEnter.each(bindTypeahead);
        }

        // update
        items = items
            .merge(itemsEnter)
            .order();

        items.select('input.member-role')
            .property('value', d => d.role)
            .on('blur', changeRole)
            .on('change', changeRole);

        items.select('button.member-delete')
            .on('click', deleteMember);

        var dragOrigin, targetIndex;

        items.call(d3_drag()
            .on('start', function(d3_event) {
                dragOrigin = {
                    x: d3_event.x,
                    y: d3_event.y
                };
                targetIndex = null;
            })
            .on('drag', function(d3_event) {
                var x = d3_event.x - dragOrigin.x,
                    y = d3_event.y - dragOrigin.y;

                if (!d3_select(this).classed('dragging') &&
                    // don't display drag until dragging beyond a distance threshold
                    Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)) <= 5) return;

                var index = items.nodes().indexOf(this);

                d3_select(this)
                    .classed('dragging', true);

                targetIndex = null;

                selection.selectAll('li.member-row')
                    .style('transform', function(d2, index2) {
                        var node = d3_select(this).node();
                        if (index === index2) {
                            return 'translate(' + x + 'px, ' + y + 'px)';
                        } else if (index2 > index && d3_event.y > node.offsetTop) {
                            if (targetIndex === null || index2 > targetIndex) {
                                targetIndex = index2;
                            }
                            return 'translateY(-100%)';
                        } else if (index2 < index && d3_event.y < node.offsetTop + node.offsetHeight) {
                            if (targetIndex === null || index2 < targetIndex) {
                                targetIndex = index2;
                            }
                            return 'translateY(100%)';
                        }
                        return null;
                    });
            })
            .on('end', function(d3_event, d) {

                if (!d3_select(this).classed('dragging')) return;

                var index = items.nodes().indexOf(this);

                d3_select(this)
                    .classed('dragging', false);

                selection.selectAll('li.member-row')
                    .style('transform', null);

                if (targetIndex !== null) {
                    // dragged to a new position, reorder
                    context.perform(
                        actionMoveMember(d.relation.id, index, targetIndex),
                        l10n.t('operations.reorder_members.annotation')
                    );
                    context.validationSystem().validate();
                }
            })
        );



        function bindTypeahead(d) {
            var row = d3_select(this);
            var role = row.selectAll('input.member-role');
            var origValue = role.property('value');

            function sort(value, data) {
                var sameletter = [];
                var other = [];
                for (var i = 0; i < data.length; i++) {
                    if (data[i].value.substring(0, value.length) === value) {
                        sameletter.push(data[i]);
                    } else {
                        other.push(data[i]);
                    }
                }
                return sameletter.concat(other);
            }

            role.call(uiCombobox(context, 'member-role')
                .fetcher(function(role, callback) {
                    // The `geometry` param is used in the `taginfo.js` interface for
                    // filtering results, as a key into the `tag_members_fractions`
                    // object.  If we don't know the geometry because the member is
                    // not yet downloaded, it's ok to guess based on type.
                    var geometry;
                    if (d.member) {
                        geometry = context.graph().geometry(d.member.id);
                    } else if (d.type === 'relation') {
                        geometry = 'relation';
                    } else if (d.type === 'way') {
                        geometry = 'line';
                    } else {
                        geometry = 'point';
                    }

                    var rtype = entity.tags.type;
                    taginfo.roles({
                        debounce: true,
                        rtype: rtype || '',
                        geometry: geometry,
                        query: role
                    }, function(err, data) {
                        if (!err) callback(sort(role, data));
                    });
                })
                .on('cancel', function() {
                    role.property('value', origValue);
                })
            );
        }


        function unbind() {
            var row = d3_select(this);

            row.selectAll('input.member-role')
                .call(uiCombobox.off, context);
        }
    }

    section.entityIDs = function(val) {
        if (!arguments.length) return _entityIDs;
        _entityIDs = val;
        return section;
    };


    return section;
}
