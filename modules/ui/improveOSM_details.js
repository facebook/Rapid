import { select as d3_select } from 'd3-selection';

import { modeSelect } from '../modes/select';
import { utilHighlightEntities } from '../util';


export function uiImproveOsmDetails(context) {
  const l10n = context.localizationSystem();
  let _qaItem;


  function issueDetail(d) {
    if (d.desc) return d.desc;
    const issueKey = d.issueKey;
    d.replacements = d.replacements || {};
    d.replacements.default = l10n.tHtml('inspector.unknown');  // special key `default` works as a fallback string
    return l10n.tHtml(`QA.improveOSM.error_types.${issueKey}.description`, d.replacements);
  }


  function improveOsmDetails(selection) {
    const details = selection.selectAll('.error-details')
      .data(
        (_qaItem ? [_qaItem] : []),
        d => `${d.id}-${d.status || 0}`
      );

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
        .html(l10n.tHtml('QA.keepRight.detail_description'));

    descriptionEnter
      .append('div')
        .attr('class', 'qa-details-description-text')
        .html(issueDetail);

    // If there are entity links in the error message..
    let relatedEntities = [];
    descriptionEnter.selectAll('.error_entity_link, .error_object_link')
      .attr('href', '#')
      .each((d, i, nodes) => {
        const node = nodes[i];
        const link = d3_select(node);
        const isObjectLink = link.classed('error_object_link');
        const entityID = isObjectLink ? (_qaItem.objectType.charAt(0) + _qaItem.objectId) : node.textContent;
        const entity = context.hasEntity(entityID);

        relatedEntities.push(entityID);

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

            context.scene().enableLayers('osm');  // make sure osm layer is even on
            context.map().centerZoom(_qaItem.loc, 20);

            if (entity) {
              context.enter(modeSelect(context, [entityID]));
            } else {
              context.loadEntity(entityID, (err, result) => {
                if (err) return;
                const entity = result.data.find(e => e.id === entityID);
                if (entity) context.enter(modeSelect(context, [entityID]));
              });
            }
          });

        // Replace with friendly name if possible
        // (The entity may not yet be loaded into the graph)
        if (entity) {
          let name = l10n.displayName(entity);  // try to use common name
          if (!name && !isObjectLink) {
            const presetSystem = context.presetSystem();
            const preset = presetSystem.match(entity, context.graph());
            name = preset && !preset.isFallback() && preset.name();  // fallback to preset name
          }

          if (name) {
            node.innerText = name;
          }
        }
      });

    // Don't hide entities related to this error - iD#5880
    context.filterSystem().forceVisible(relatedEntities);
    context.map().immediateRedraw();
  }

  improveOsmDetails.issue = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return improveOsmDetails;
  };

  return improveOsmDetails;
}
