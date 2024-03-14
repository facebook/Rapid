import { drag as d3_drag } from 'd3-drag';
import { select as d3_select } from 'd3-selection';
import { vecLength, vecSubtract } from '@rapid-sdk/math';
import { utilUniqueString } from '@rapid-sdk/util';

import { actionChangeMember } from '../../actions/change_member.js';
import { actionDeleteMember } from '../../actions/delete_member.js';
import { actionMoveMember } from '../../actions/move_member.js';
import { osmEntity } from '../../osm/entity.js';
import { uiIcon } from '../icon.js';
import { uiCombobox } from '../combobox.js';
import { uiSection } from '../section.js';
import { utilHighlightEntities, utilIsColorValid, utilNoAuto } from '../../util/index.js';

const MAX_MEMBERS = 1000;


export function uiSectionRawMemberEditor(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const presets = context.systems.presets;
  const taginfo = context.services.taginfo;
  const viewport = context.viewport;

  let _entityIDs = [];


  const section = uiSection(context, 'raw-member-editor')
    .shouldDisplay(function() {
      if (!_entityIDs || _entityIDs.length !== 1) return false;

      const graph = editor.staging.graph;  // the current graph
      const entity = graph.hasEntity(_entityIDs[0]);
      return entity?.type === 'relation';
    })
    .label(function() {
      const graph = editor.staging.graph;  // the current graph
      const entity = graph.hasEntity(_entityIDs[0]);
      if (!entity) return '';

      const gt = entity.members.length > MAX_MEMBERS ? '>' : '';
      const count = gt + entity.members.slice(0, MAX_MEMBERS).length;
      return l10n.t('inspector.title_count', { title: l10n.t('inspector.members'), count: count });
    })
    .disclosureContent(renderDisclosureContent);


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

    const graph = editor.staging.graph;
    const entity = graph.entity(d.id);
    map.fitEntitiesEase(entity);

    // highlight the feature in case it wasn't previously on-screen
    utilHighlightEntities([d.id], true, context);
  }


  function selectMember(d3_event, d) {
    d3_event.preventDefault();

    // remove the hover-highlight styling
    utilHighlightEntities([d.id], false, context);

    const graph = editor.staging.graph;
    const entity = graph.entity(d.id);
    const extent = viewport.visibleExtent();
    if (!entity.intersects(extent, graph)) {
      // zoom to the entity if its extent is not visible now
      map.fitEntitiesEase(entity);
    }

    context.enter('select-osm', { selection: { osm: [d.id] }} );
  }


  function changeRole(d3_event, d) {
    const oldRole = d.role;
    const newRole = context.cleanRelationRole(d3_select(this).property('value'));

    if (oldRole !== newRole) {
      const member = { id: d.id, type: d.type, role: newRole };
      editor.perform(actionChangeMember(d.relation.id, member, d.index));
      editor.commit({
        annotation: l10n.t('operations.change_role.annotation', { n: 1 }),
        selectedIDs: [d.relation.id]
      });
    }
  }


  function deleteMember(d3_event, d) {
    utilHighlightEntities([d.id], false, context);  // remove the hover-highlight styling

    editor.perform(actionDeleteMember(d.relation.id, d.index));
    editor.commit({
      annotation: l10n.t('operations.delete_member.annotation', { n: 1 }),
      selectedIDs: [d.relation.id]
    });

    const graph = editor.staging.graph;  // the current graph, after the edit was performed

    // Removing the last member will also delete the relation. If this happens we need to exit select mode
    if (!graph.hasEntity(d.relation.id)) {
      context.enter('browse');
    }
  }


  function renderDisclosureContent(selection) {
    const graph = editor.staging.graph;  // the current graph
    const entityID = _entityIDs[0];
    const entity = graph.entity(entityID);
    let memberships = [];

    entity.members.slice(0, MAX_MEMBERS).forEach((member, index) => {
      memberships.push({
        index: index,
        id: member.id,
        type: member.type,
        role: member.role,
        relation: entity,
        member: graph.hasEntity(member.id),
        uid: utilUniqueString(`${entityID}-member-${index}`)
      });
    });

    let list = selection.selectAll('.member-list')
      .data([0]);

    list = list.enter()
      .append('ul')
      .attr('class', 'member-list')
      .merge(list);


    let items = list.selectAll('li')
      .data(memberships, d => {
        const parentKey = osmEntity.key(d.relation);
        const childKey = (d.member && osmEntity.key(d.member)) || 'incomplete';
        return `${parentKey},${d.index},${childKey}`;
      });

    items.exit()
      .each(_unbindCombo)
      .remove();

    let itemsEnter = items.enter()
      .append('li')
      .attr('class', 'member-row form-field')
      .classed('member-incomplete', d => !d.member);

    itemsEnter
      .each((d, i, nodes) => {
        const item = d3_select(nodes[i]);

        let label = item
          .append('label')
          .attr('class', 'field-label')
          .attr('for', d.uid);

        if (d.member) {    // if the child has been loaded
          item
            .on('mouseover', () => utilHighlightEntities([d.id], true, context))
            .on('mouseout', () => utilHighlightEntities([d.id], false, context));

          let labelLink = label
            .append('span')
            .attr('class', 'label-text')
            .append('a')
            .attr('href', '#')
            .on('click', selectMember);

          labelLink
            .append('span')
            .attr('class', 'member-entity-type')
            .html(d => {
              const matched = presets.match(d.member, editor.staging.graph);
              return (matched && matched.name()) || l10n.displayType(d.member.id);
            });

          labelLink
            .append('span')
            .attr('class', 'member-entity-name')
            .classed('has-color', d => !!_getColor(d.member))
            .style('border-color', d => _getColor(d.member))
            .text(d => (d.member ? l10n.displayName(d.member.tags) : ''));

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

        } else {   // if the child has not yet loaded
          let labelText = label
            .append('span')
            .attr('class', 'label-text');

          labelText
            .append('span')
            .attr('class', 'member-entity-type')
            .text(l10n.t(`inspector.${d.type}`, { id: d.id }));

          labelText
            .append('span')
            .attr('class', 'member-entity-name')
            .text(l10n.t('inspector.incomplete', { id: d.id }));

          label
            .append('button')
            .attr('class', 'member-download')
            .attr('title', l10n.t('icons.download'))
            .call(uiIcon('#rapid-icon-load'))
            .on('click', downloadMember);
        }
      });

    let wrapEnter = itemsEnter
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
      wrapEnter.each(_bindCombo);
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

    let x0, y0, targetIndex;

    items.call(d3_drag()
      .on('start', function(d3_event) {
        x0 = d3_event.x;
        y0 = d3_event.y;
        targetIndex = null;
      })
      .on('drag', function(d3_event) {
        const [x1, y1] = [d3_event.x, d3_event.y];
        const [dx, dy] = vecSubtract([x1, y1], [x0, y0]);

        // don't display drag until dragging beyond a distance threshold
        if (!d3_select(this).classed('dragging') && vecLength([dx, dy]) <= 5) return;

        let index = items.nodes().indexOf(this);

        d3_select(this)
          .classed('dragging', true);

        targetIndex = null;

        selection.selectAll('li.member-row')
          .style('transform', function(d2, index2) {
            let node = d3_select(this).node();
            if (index === index2) {
              return `translate(${dx}px, ${dy}px)`;
            } else if (index2 > index && y1 > node.offsetTop) {
              if (targetIndex === null || index2 > targetIndex) {
                targetIndex = index2;
              }
              return 'translateY(-100%)';
            } else if (index2 < index && y1 < node.offsetTop + node.offsetHeight) {
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

        let index = items.nodes().indexOf(this);

        d3_select(this)
          .classed('dragging', false);

        selection.selectAll('li.member-row')
          .style('transform', null);

        if (targetIndex !== null) {   // dragged to a new position, reorder
          editor.perform(actionMoveMember(d.relation.id, index, targetIndex));
          editor.commit({
            annotation: l10n.t('operations.reorder_members.annotation'),
            selectedIDs: [d.relation.id]
          });
        }
      })
    );
  }


  section.entityIDs = function(val) {
    if (!arguments.length) return _entityIDs;
    _entityIDs = val || [];
    return section;
  };


  function _getColor(entity) {
    const val = entity?.type === 'relation' && entity?.tags.colour;
    return (val && utilIsColorValid(val)) ? val : null;
  }


  function _bindCombo(d, i, nodes) {
    let row = d3_select(nodes[i]);
    let role = row.selectAll('input.member-role');
    let origValue = role.property('value');

    function sort(value, data) {
      let sameletter = [];
      let other = [];
      for (const item of data) {
        if (item.value.substring(0, value.length) === value) {
          sameletter.push(item);
        } else {
          other.push(item);
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
        let geometry;
        if (d.member) {
          const graph = editor.staging.graph;  // the current graph
          geometry = graph.geometry(d.member.id);
        } else if (d.type === 'relation') {
          geometry = 'relation';
        } else if (d.type === 'way') {
          geometry = 'line';
        } else {
          geometry = 'point';
        }

        taginfo.roles({
          debounce: true,
          rtype: d.relation.tags.type || '',
          geometry: geometry,
          query: role
        }, (err, data) => {
          if (!err) callback(sort(role, data));
        });
      })
      .on('cancel', () => {
        role.property('value', origValue);
      })
    );
  }


  function _unbindCombo(d, i, nodes) {
    const row = d3_select(nodes[i]);
    row.selectAll('input.member-role')
      .call(uiCombobox.off, context);
  }


  return section;
}
