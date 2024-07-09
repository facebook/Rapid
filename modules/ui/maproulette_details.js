import { select as d3_select } from 'd3-selection';

import { utilHighlightEntities } from '../util/index.js';

export function uiMapRouletteDetails(context) {
  const l10n = context.systems.l10n;
  const maproulette = context.services.maproulette;

  let _qaItem;


  function parseShortCodes(text) {
    const segments = text.split(/\[select\s+&quot;\s*[^"]*?\s*&quot;\s+name=&quot;/);
    let transformedText = segments[0];
    segments.slice(1).forEach(segment => {
      const endIndex = segment.indexOf('&quot;');
      const dropdownName = segment.substring(0, endIndex);
      const valuesStart = segment.indexOf('values=&quot;') + 'values=&quot;'.length;
      const valuesEnd = segment.indexOf('&quot;', valuesStart);
      const options = segment.substring(valuesStart, valuesEnd).split(',');
      const dropdownHtml = `<select name="${dropdownName}"><option value=""></option>${options.map(option => `<option value="${option.trim()}">${option.trim()}</option>`).join('')}</select>`;
      const remainder = segment.substring(valuesEnd + '&quot;'.length).trim().replace(/^\]/, ''); // Remove the first closing bracket if it exists
      transformedText += dropdownHtml + remainder;
    });
    return transformedText;
  }


  function replaceMustacheTags(text, task) {
    const tagRegex = /\{\{([\w:]+)\}\}/g;
    return text.replace(tagRegex, (match, propertyName) => {
      if (propertyName === 'osmIdentifier' && task.title) {
        const osmId = task.title.split('@')[0]; // Extract the full ID including the prefix
        return `<a href="#" class="highlight-link" data-osm-id="${osmId}">${osmId}</a>`;
      }
      if (task.properties && task.properties.hasOwnProperty(propertyName)) {
        return task.properties[propertyName];
      }
      return '';
    });
  }


  function highlightFeature(osmIdentifier) {
    const idPart = osmIdentifier.split('@')[0]; // Retains the 'n' or 'w' prefix and removes the version
    // Pass the full ID including the prefix to the selection context
    context.enter('select-osm', {
      selection: { osm: [idPart] }
    });
  }


  function render(selection) {
    let details = selection.selectAll('.error-details')
      .data(_qaItem ? [_qaItem] : [], d => d.key);
    details.exit().remove();
    const detailsEnter = details.enter()
      .append('div')
      .attr('class', 'error-details qa-details-container');

    detailsEnter.append('div')
      .attr('class', 'qa-details-subsection')
      .text(l10n.t('map_data.layers.maproulette.loading_task_details'));

    details = details.merge(detailsEnter);

    maproulette.loadTaskDetailAsync(_qaItem).then(task => {
      if (!task) return;
      if (_qaItem.id !== task.id) return;
      const selection = details.selectAll('.qa-details-subsection');
      selection.html('');   // replace contents
      // Display Challenge ID and Task ID
      if (task.id) {
        selection
          .append('h4')
          .text(l10n.t('map_data.layers.maproulette.id_title'));
        selection
          .append('p')
          .text(`${task.parentId} / ${task.id}`)
          .selectAll('a')
          .attr('rel', 'noopener')
          .attr('target', '_blank');
      }

      const description = parseShortCodes(replaceMustacheTags(task.description, task));
      const instruction = parseShortCodes(replaceMustacheTags(task.instruction, task));
      if (task.description && !task.description.includes('Lorem')) {
        selection
          .append('h4')
          .text(l10n.t('map_data.layers.maproulette.detail_title'));
        selection
          .append('p')
          .html(description)  // parsed markdown
          .selectAll('a')
          .attr('rel', 'noopener')
          .attr('target', '_blank');
      }

      if (task.instruction && !task.instruction.includes('Lorem') && task.instruction !== task.description) {
        selection
          .append('h4')
          .text(l10n.t('map_data.layers.maproulette.instruction_title'));
        selection
          .append('p')
          .html(instruction)  // parsed markdown
          .selectAll('a')
          .attr('rel', 'noopener')
          .attr('target', '_blank');
      }

      // Attach hover and click event listeners
      selection.selectAll('.highlight-link')
        .on('mouseover', function() {
          const osmId = d3_select(this).attr('data-osm-id');
          utilHighlightEntities([osmId], true, context);
        })
        .on('mouseout', function() {
          const osmId = d3_select(this).attr('data-osm-id');
          utilHighlightEntities([osmId], false, context);
        })
        .on('click', function(d3_event) {
          d3_event.preventDefault();
          const osmId = d3_select(this).attr('data-osm-id');
          highlightFeature(osmId);
        });
    }).catch(e => {
        details.selectAll('.qa-details-subsection').text(l10n.t('map_data.layers.maproulette.error_loading_task_details'));
    });
  }


  render.task = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return render;
  };


  return render;
}