import { select as d3_select } from 'd3-selection';
import { utilArrayGroupBy, utilArrayIntersection, utilUniqueString } from '@rapid-sdk/util';

import { actionAddEntity } from '../../actions/add_entity.js';
import { actionAddMember } from '../../actions/add_member.js';
import { actionChangeMember } from '../../actions/change_member.js';
import { actionDeleteMembers } from '../../actions/delete_members.js';
import { osmEntity, osmRelation } from '../../osm/index.js';
import { uiIcon } from '../icon.js';
import { uiCombobox } from '../combobox.js';
import { uiSection } from '../section.js';
import { uiTooltip } from '../tooltip.js';
import { utilNoAuto, utilIsColorValid, utilHighlightEntities } from '../../util/index.js';

const MAX_MEMBERSHIPS = 1000;


export function uiSectionRawMembershipEditor(context) {
    const editor = context.systems.editor;
    const l10n = context.systems.l10n;
    const map = context.systems.map;
    const presets = context.systems.presets;
    const taginfo = context.services.taginfo;
    const viewport = context.viewport;

    var section = uiSection(context, 'raw-membership-editor')
        .shouldDisplay(function() {
            return _entityIDs && _entityIDs.length;
        })
        .label(function() {
            var parents = getSharedParentRelations();
            var gt = parents.length > MAX_MEMBERSHIPS ? '>' : '';
            var count = gt + parents.slice(0, MAX_MEMBERSHIPS).length;
            return l10n.t('inspector.title_count', { title: l10n.t('inspector.relations'), count: count });
        })
        .disclosureContent(renderDisclosureContent);

    var nearbyCombo = uiCombobox(context, 'parent-relation')
        .minItems(1)
        .fetcher(fetchNearbyRelations)
        .itemsMouseEnter(function(d3_event, d) {
            if (d.relation) utilHighlightEntities([d.relation.id], true, context);
        })
        .itemsMouseLeave(function(d3_event, d) {
            if (d.relation) utilHighlightEntities([d.relation.id], false, context);
        });
    var _inChange = false;
    var _entityIDs = [];
    var _showBlank;

    function getSharedParentRelations() {
        var parents = [];
        for (var i = 0; i < _entityIDs.length; i++) {
            var entity = editor.staging.graph.hasEntity(_entityIDs[i]);
            if (!entity) continue;

            if (i === 0) {
                parents = editor.staging.graph.parentRelations(entity);
            } else {
                parents = utilArrayIntersection(parents, editor.staging.graph.parentRelations(entity));
            }
            if (!parents.length) break;
        }
        return parents;
    }

    function getMemberships() {
        var memberships = [];
        var relations = getSharedParentRelations().slice(0, MAX_MEMBERSHIPS);

        var isMultiselect = _entityIDs.length > 1;

        var i, relation, membership, index, member, indexedMember;
        for (i = 0; i < relations.length; i++) {
            relation = relations[i];
            membership = {
                relation: relation,
                members: [],
                hash: osmEntity.key(relation)
            };
            for (index = 0; index < relation.members.length; index++) {
                member = relation.members[index];
                if (_entityIDs.indexOf(member.id) !== -1) {
                    indexedMember = Object.assign({}, member, { index: index });
                    membership.members.push(indexedMember);
                    membership.hash += ',' + index.toString();

                    if (!isMultiselect) {
                        // For single selections, list one entry per membership per relation.
                        // For multiselections, list one entry per relation.

                        memberships.push(membership);
                        membership = {
                            relation: relation,
                            members: [],
                            hash: osmEntity.key(relation)
                        };
                    }
                }
            }
            if (membership.members.length) memberships.push(membership);
        }

        memberships.forEach(function(membership) {
            membership.uid = utilUniqueString('membership-' + membership.relation.id);
            var roles = [];
            membership.members.forEach(function(member) {
                if (roles.indexOf(member.role) === -1) roles.push(member.role);
            });
            membership.role = roles.length === 1 ? roles[0] : roles;
        });

        return memberships;
    }

    function selectRelation(d3_event, d) {
        d3_event.preventDefault();

        // remove the hover-highlight styling
        utilHighlightEntities([d.relation.id], false, context);

        context.enter('select-osm', { selection: { osm: [d.relation.id] }} );
    }


    function zoomToRelation(d3_event, d) {
        d3_event.preventDefault();

        const graph = editor.staging.graph;
        const entity = graph.entity(d.relation.id);
        map.fitEntitiesEase(entity);

        // highlight the relation in case it wasn't previously on-screen
        utilHighlightEntities([d.relation.id], true, context);
    }


    function _getColor(entity) {
      const val = entity?.type === 'relation' && entity?.tags.colour;
      return (val && utilIsColorValid(val)) ? val : null;
    }


    function changeRole(d3_event, d) {
        if (d === 0) return;    // called on newrow (shouldn't happen)
        if (_inChange) return;  // avoid accidental recursive call iD#5731

        var newRole = context.cleanRelationRole(d3_select(this).property('value'));

        if (!newRole.trim() && typeof d.role !== 'string') return;

        var membersToUpdate = d.members.filter(function(member) {
            return member.role !== newRole;
        });

        if (membersToUpdate.length) {
            _inChange = true;

            const changeMemberRoles = (graph) => {
              for (const member of membersToUpdate) {
                const newMember = Object.assign({}, member, { role: newRole });
                delete newMember.index;
                graph = actionChangeMember(d.relation.id, newMember, member.index)(graph);
              }
              return graph;
            };

            editor.perform(changeMemberRoles);
            editor.commit({
              annotation: l10n.t('operations.change_role.annotation', { n: membersToUpdate.length }),
              selectedIDs: [d.relation.id]
            });
        }
        _inChange = false;
    }


    function addMembership(d, role) {
        this.blur();           // avoid keeping focus on the button
        _showBlank = false;

        function actionAddMembers(relationId, ids, role) {
            return function(graph) {
                for (var i in ids) {
                    var member = { id: ids[i], type: graph.entity(ids[i]).type, role: role };
                    graph = actionAddMember(relationId, member)(graph);
                }
                return graph;
            };
        }

        if (d.relation) {
            editor.perform(actionAddMembers(d.relation.id, _entityIDs, role));
            editor.commit({
              annotation: l10n.t('operations.add_member.annotation', { n: _entityIDs.length }),
              selectedIDs: [d.relation.id]
            });

        } else {
            var relation = osmRelation();
            editor.perform(
              actionAddEntity(relation),
              actionAddMembers(relation.id, _entityIDs, role)
            );
            editor.commit({
              annotation: l10n.t('operations.add.annotation.relation'),
              selectedIDs: [relation.id]
            });
            context.enter('select-osm', { selection: { osm: [relation.id] }, newFeature: true });
        }
    }


    function deleteMembership(d3_event, d) {
        this.blur();           // avoid keeping focus on the button
        if (d === 0) return;   // called on newrow (shouldn't happen)

        // remove the hover-highlight styling
        utilHighlightEntities([d.relation.id], false, context);

        var indexes = d.members.map(function(member) {
            return member.index;
        });

        editor.perform(actionDeleteMembers(d.relation.id, indexes));
        editor.commit({
          annotation: l10n.t('operations.delete_member.annotation', { n: _entityIDs.length }),
          selectedIDs: [d.relation.id]
        });
    }


    function fetchNearbyRelations(q, callback) {
        var newRelation = {
            relation: null,
            value: l10n.t('inspector.new_relation'),
            display: l10n.t('inspector.new_relation')
        };

        var entityID = _entityIDs[0];
        var result = [];
        var graph = editor.staging.graph;

        function baseDisplayValue(entity) {
            var matched = presets.match(entity, graph);
            var presetName = (matched && matched.name()) || l10n.t('inspector.relation');
            var entityName = l10n.displayName(entity.tags) || '';
            return presetName + ' ' + entityName;
        }

        function baseDisplayLabel(entity) {
            var matched = presets.match(entity, graph);
            var presetName = (matched && matched.name()) || l10n.t('inspector.relation');
            var entityName = l10n.displayName(entity.tags) || '';
            var color = _getColor(entity);

            return selection => {
                selection
                    .append('b')
                    .text(presetName + ' ');
                selection
                    .append('span')
                    .classed('has-color', !!color)
                    .style('border-color', color)
                    .text(entityName);
            };
        }

        var explicitRelation = q && graph.hasEntity(q.toLowerCase());
        if (explicitRelation && explicitRelation.type === 'relation' && explicitRelation.id !== entityID) {
            // loaded relation is specified explicitly, only show that
            result.push({
                relation: explicitRelation,
                value: baseDisplayValue(explicitRelation) + ' ' + explicitRelation.id,
                display: baseDisplayLabel(explicitRelation)
            });

        } else {
            const extent = viewport.visibleExtent();
            editor.intersects(extent).forEach(function(entity) {
                if (entity.type !== 'relation' || entity.id === entityID) return;

                var value = baseDisplayValue(entity);
                if (q && (value + ' ' + entity.id).toLowerCase().indexOf(q.toLowerCase()) === -1) return;

                result.push({
                    relation: entity,
                    value: value,
                    display: baseDisplayLabel(entity)
                });
            });

            result.sort(function(a, b) {
                return osmRelation.creationOrder(a.relation, b.relation);
            });

            // Dedupe identical names by appending relation id - see iD#2891
            var dupeGroups = Object.values(utilArrayGroupBy(result, 'value'))
                .filter(function(v) { return v.length > 1; });

            dupeGroups.forEach(function(group) {
                group.forEach(function(obj) {
                    obj.value += ' ' + obj.relation.id;
                });
            });
        }

        result.forEach(function(obj) {
            obj.title = obj.value;
        });

        result.unshift(newRelation);
        callback(result);
    }


    function renderDisclosureContent(selection) {
        var memberships = getMemberships();
        var list = selection.selectAll('.member-list')
            .data([0]);

        list = list.enter()
            .append('ul')
            .attr('class', 'member-list')
            .merge(list);


        var items = list.selectAll('li.member-row-normal')
            .data(memberships, function(d) {
                return d.hash;
            });

        items.exit()
            .each(unbind)
            .remove();

        // Enter
        var itemsEnter = items.enter()
            .append('li')
            .attr('class', 'member-row member-row-normal form-field');

        // highlight the relation in the map while hovering on the list item
        itemsEnter
            .on('mouseover', function(d3_event, d) {
                utilHighlightEntities([d.relation.id], true, context);
            })
            .on('mouseout', function(d3_event, d) {
                utilHighlightEntities([d.relation.id], false, context);
            });

        var labelEnter = itemsEnter
            .append('label')
            .attr('class', 'field-label')
            .attr('for', function(d) {
                return d.uid;
            });

        var labelLink = labelEnter
            .append('span')
            .attr('class', 'label-text')
            .append('a')
            .attr('href', '#')
            .on('click', selectRelation);

        labelLink
            .append('span')
            .attr('class', 'member-entity-type')
            .html(function(d) {
                const matched = presets.match(d.relation, editor.staging.graph);
                return (matched && matched.name()) || l10n.t('inspector.relation');
            });

        labelLink
            .append('span')
            .attr('class', 'member-entity-name')
            .classed('has-color', d => !!_getColor(d.relation))
            .style('border-color', d => _getColor(d.relation))
            .text(function(d) {
                const matched = presets.match(d.relation, editor.staging.graph);
                // hide the network from the name if there is NSI match
                return l10n.displayName(d.relation.tags, matched.suggestion);
            });

        labelEnter
            .append('button')
            .attr('class', 'remove member-delete')
            .call(uiIcon('#rapid-operation-delete'))
            .on('click', deleteMembership);

        labelEnter
            .append('button')
            .attr('class', 'member-zoom')
            .attr('title', l10n.t('icons.zoom_to'))
            .call(uiIcon('#rapid-icon-framed-dot', 'monochrome'))
            .on('click', zoomToRelation);

        var wrapEnter = itemsEnter
            .append('div')
            .attr('class', 'form-field-input-wrap form-field-input-member');

        wrapEnter
            .append('input')
            .attr('class', 'member-role')
            .attr('id', function(d) {
                return d.uid;
            })
            .property('type', 'text')
            .property('value', function(d) {
                return typeof d.role === 'string' ? d.role : '';
            })
            .attr('title', function(d) {
                return Array.isArray(d.role) ? d.role.filter(Boolean).join('\n') : d.role;
            })
            .attr('placeholder', function(d) {
                return Array.isArray(d.role) ? l10n.t('inspector.multiple_roles') : l10n.t('inspector.role');
            })
            .classed('mixed', function(d) {
                return Array.isArray(d.role);
            })
            .call(utilNoAuto)
            .on('blur', changeRole)
            .on('change', changeRole);

        if (taginfo) {
            wrapEnter.each(bindTypeahead);
        }

        var newMembership = list.selectAll('.member-row-new')
            .data(_showBlank ? [0] : []);

        // Exit
        newMembership.exit()
            .remove();

        // Enter
        var newMembershipEnter = newMembership.enter()
            .append('li')
            .attr('class', 'member-row member-row-new form-field');

        var newLabelEnter = newMembershipEnter
            .append('label')
            .attr('class', 'field-label');

        newLabelEnter
            .append('input')
            .attr('placeholder', l10n.t('inspector.choose_relation'))
            .attr('type', 'text')
            .attr('class', 'member-entity-input')
            .call(utilNoAuto);

        newLabelEnter
            .append('button')
            .attr('class', 'remove member-delete')
            .call(uiIcon('#rapid-operation-delete'))
            .on('click', function() {
                list.selectAll('.member-row-new')
                    .remove();
            });

        var newWrapEnter = newMembershipEnter
            .append('div')
            .attr('class', 'form-field-input-wrap form-field-input-member');

        newWrapEnter
            .append('input')
            .attr('class', 'member-role')
            .property('type', 'text')
            .attr('placeholder', l10n.t('inspector.role'))
            .call(utilNoAuto);

        // Update
        newMembership = newMembership
            .merge(newMembershipEnter);

        newMembership.selectAll('.member-entity-input')
            .on('blur', cancelEntity)   // if it wasn't accepted normally, cancel it
            .call(nearbyCombo
                .on('accept', acceptEntity)
                .on('cancel', cancelEntity)
            );


        // Container for the Add button
        var addRow = selection.selectAll('.add-row')
            .data([0]);

        // enter
        var addRowEnter = addRow.enter()
            .append('div')
            .attr('class', 'add-row');

        var addRelationButton = addRowEnter
            .append('button')
            .attr('class', 'add-relation');

        addRelationButton
            .call(uiIcon('#rapid-icon-plus', 'light'));
        addRelationButton
            .call(uiTooltip(context)
              .title(l10n.t('inspector.add_to_relation'))
              .placement(l10n.isRTL() ? 'left' : 'right')
             );

        addRowEnter
            .append('div')
            .attr('class', 'space-value');   // preserve space

        addRowEnter
            .append('div')
            .attr('class', 'space-buttons');  // preserve space

        // update
        addRow = addRow
            .merge(addRowEnter);

        addRow.select('.add-relation')
            .on('click', function() {
                _showBlank = true;
                section.reRender();
                list.selectAll('.member-entity-input').node().focus();
            });


        function acceptEntity(d) {
            if (!d) {
                cancelEntity();
                return;
            }
            // remove hover-higlighting
            if (d.relation) utilHighlightEntities([d.relation.id], false, context);

            var role = context.cleanRelationRole(list.selectAll('.member-row-new .member-role').property('value'));
            addMembership(d, role);
        }


        function cancelEntity() {
            var input = newMembership.selectAll('.member-entity-input');
            input.property('value', '');

            // remove hover-higlighting
            context.surface().selectAll('.highlighted')
                .classed('highlighted', false);
        }


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
                    var rtype = d.relation.tags.type;
                    taginfo.roles({
                        debounce: true,
                        rtype: rtype || '',
                        geometry: editor.staging.graph.geometry(_entityIDs[0]),
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
        _showBlank = false;
        return section;
    };


    return section;
}
