import { select as d3_select } from 'd3-selection';

import { utilHighlightEntities } from '../util';


export function uiMapRouletteDetails(context) {
  const editor = context.systems.editor;
  const filters = context.systems.filters;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const maproulette = context.services.maproulette;
  const presets = context.systems.presets;

  let _qaItem;


  function taskString(d, type) {
    if (!maproulette || !d) return '';

    // Issue strings are cached from MapRoulette API
    // const s = maproulette.getStrings(d.itemType);
    // return (type in s) ? s[type] : '';
    return null;
  }


  function maprouletteDetails(selection) {

    // Save current item to check if UI changed by time request resolves
    if (!maproulette) return;
    maproulette.loadTaskDetailAsync(_qaItem)
      .then(d => {
        const details = selection.selectAll('.error-details')
        .data(_qaItem ? [_qaItem] : [], d => `${d.id}-${d.status || 0}` );
  
      details.exit()
        .remove();
  
      const detailsEnter = details.enter()
        .append('div')
        .attr('class', 'error-details qa-details-container');
  
  
      // Description
      if (_qaItem.task.parentName && _qaItem.task.parentId) {
        const div = detailsEnter
          .append('div')
          .attr('class', 'qa-details-subsection');
  
        div
          .append('h4')
          .html(l10n.tHtml('QA.keepRight.detail_description'));
  
        div
          .append('p')
          .attr('class', 'qa-details-description-text')
          // .html(d => `Challenge name: ${_qaItem.task.parentName} || Challenge ID: ${_qaItem.task.parentId} || Task ID: ${_qaItem.task.id}`) // change this to show challenge details
          .html(d => _qaItem.details.description) // This throws unhandled error that prevents line 106 of this same file from executing, which has to execute before the data here can even exist. Solution: run loadTaskDetailAsync before running this line.
          .selectAll('a')
          .attr('rel', 'noopener')
          .attr('target', '_blank');
      }
  
      // Elements (populated later as data is requested)
      const detailsDiv = detailsEnter
        .append('div')
        .attr('class', 'qa-details-subsection');
  
      const elemsDiv = detailsEnter
        .append('div')
        .attr('class', 'qa-details-subsection');
  
      // Suggested Fix (mustn't exist for every issue type)
      if (taskString(_qaItem, 'fix')) {
        const div = detailsEnter
          .append('div')
          .attr('class', 'qa-details-subsection');
  
        div
          .append('h4')
          .html(l10n.tHtml('QA.maproulette.fix_title'));
  
        div
          .append('p')
          .html(d => taskString(d, 'fix'))
          .selectAll('a')
          .attr('rel', 'noopener')
          .attr('target', '_blank');
      }
  
      // Common Pitfalls (mustn't exist for every issue type)
      if (taskString(_qaItem, 'trap')) {
        const div = detailsEnter
          .append('div')
          .attr('class', 'qa-details-subsection');
  
        div
          .append('h4')
          .html(l10n.tHtml('QA.maproulette.trap_title'));
  
        div
          .append('p')
          .html(d => taskString(d, 'trap'))
          .selectAll('a')
          .attr('rel', 'noopener')
          .attr('target', '_blank');
      }
  
        // Do nothing if _qaItem has changed by the time Promise resolves
        if (_qaItem.id !== d.id) return;

        // No details to add if there are no associated issue elements
        if (!d.task) return;

        // Things like keys and values are dynamically added to a subtitle string
        if (d.task.parentName && d.details.parent) {
          detailsDiv
            .append('h4')
            .html(l10n.tHtml('QA.maproulette.detail_title'));

          detailsDiv
            .append('p')
            .html(d => `${d.task.parentName} ${d.details.parent}`)
            .selectAll('a')
            .attr('rel', 'noopener')
            .attr('target', '_blank');
        }

        // Create list of linked issue elements
        elemsDiv
          .append('h4')
          .html(l10n.tHtml('QA.maproulette.elems_title'));

        elemsDiv
          .append('ul').selectAll('li')
          .data(d.elems)
          .enter()
          .append('li')
          .append('a')
          .attr('href', '#')
          .attr('class', 'error_entity_link')
          .html(d => d)
          .each((d, i, nodes) => {
            const node = nodes[i];
            const link = d3_select(node);
            const entityID = node.textContent;
            const graph = editor.staging.graph;
            const entity = graph.hasEntity(entityID);

            // Add click handler
            link
              .on('mouseenter', () => {
                utilHighlightEntities([entityID], true, context);
              })
              .on('mouseleave', () => {
                utilHighlightEntities([entityID], false, context);
              })
              .on('click', (d3_event) => {
                d3_event.preventDefault();

                utilHighlightEntities([entityID], false, context);

                map.scene.enableLayers('osm');  // make sure osm layer is even on
                map.centerZoom(d.loc, 20);
                map.selectEntityID(entityID);
              });

            // Replace with friendly name if possible
            // (The entity may not yet be loaded into the graph)
            if (entity) {
              let name = l10n.displayName(entity.tags);  // try to use common name
              if (!name) {
                const preset = presets.match(entity, graph);
                name = preset && !preset.isFallback() && preset.name();  // fallback to preset name
              }

              if (name) {
                node.innerText = name;
              }
            }
          });

        // Don't hide entities related to this issue - iD#5880
        filters.forceVisible(d.elems);
        map.immediateRedraw();
      })
      .catch(e => console.error(e));  // eslint-disable-line
  }


  maprouletteDetails.issue = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return maprouletteDetails;
  };


  return maprouletteDetails;
}
