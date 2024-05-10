import { select as d3_select } from 'd3-selection';

import { utilHighlightEntities } from '../util/index.js';


export function uiKeepRightDetails(context) {
  const editor = context.systems.editor;
  const filters = context.systems.filters;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const presets = context.systems.presets;

  let _qaItem;


  function issueDetailHTML(d) {
    const { itemType, parentIssueType } = d;
    const unknown = l10n.t('inspector.unknown');
    let replacements = d.replacements || {};  // some replacements are html linkified
    replacements.default = unknown;  // special key `default` works as a fallback string

    let detail = l10n.t(`QA.keepRight.errorTypes.${itemType}.description`, replacements);
    if (detail === unknown) {
      detail = l10n.t(`QA.keepRight.errorTypes.${parentIssueType}.description`, replacements);
    }
    return detail;
  }


  function render(selection) {
    const details = selection.selectAll('.error-details')
      .data(_qaItem ? [_qaItem] : [], d => d.key);

    details.exit()
      .remove();

    const detailsEnter = details.enter()
      .append('div')
      .attr('class', 'error-details qa-details-container');

    // description
    const descriptionEnter = detailsEnter
      .append('div')
      .attr('class', 'qa-details-subsection');

    descriptionEnter
      .append('h4')
      .text(l10n.t('QA.keepRight.detail_description'));

    descriptionEnter
      .append('div')
      .attr('class', 'qa-details-description-text')
      .html(issueDetailHTML);

    // If there are entity links in the error message..
    let relatedEntities = [];
    descriptionEnter.selectAll('.error_entity_link, .error_object_link')
      .attr('href', '#')
      .each((d, i, nodes) => {
        const node = nodes[i];
        const link = d3_select(node);
        const isObjectLink = link.classed('error_object_link');
        const entityID = isObjectLink ? (_qaItem.objectType.charAt(0) + _qaItem.objectId) : node.textContent;
        const graph = editor.staging.graph;
        const entity = graph.hasEntity(entityID);

        relatedEntities.push(entityID);

        // Add click handler
        link
          .on('mouseenter', () => {
            utilHighlightEntities([entityID], true, context);
          })
          .on('mouseleave', () => {
            utilHighlightEntities([entityID], false, context);
          })
          .on('click', d3_event => {
            d3_event.preventDefault();

            utilHighlightEntities([entityID], false, context);

            map.scene.enableLayers('osm');  // make sure osm layer is even on
            map.centerZoomEase(_qaItem.loc, 20);
            map.selectEntityID(entityID);
          });

        // Replace with friendly name if possible
        // (The entity may not yet be loaded into the graph)
        if (entity) {
          let name = l10n.displayName(entity.tags);  // try to use common name
          if (!name && !isObjectLink) {
            const preset = presets.match(entity, graph);
            name = preset && !preset.isFallback() && preset.name();  // fallback to preset name
          }

          if (name) {
            node.innerText = name;
          }
        }
      });

    // Don't hide entities related to this issue - iD#5880
    filters.forceVisible(relatedEntities);
    map.immediateRedraw();
  }


  render.issue = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return render;
  };

  return render;
}
