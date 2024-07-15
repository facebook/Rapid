import { select as d3_select } from 'd3-selection';

import { utilHighlightEntities } from '../util/index.js';

export function uiMapRouletteDetails(context) {
  const l10n = context.systems.l10n;
  const maproulette = context.services.maproulette;

  let _qaItem;


  /**
   * Generates HTML for a dropdown menu with the specified name and options.
   *
   * @param {string} dropdownName The name attribute for the dropdown.
   * @param {Array<string>} options An array of options to be included in the dropdown.
   * @returns {string} HTML string representing a dropdown menu.
   */
  function generateDropdownHtml(dropdownName, options) {
    return `<select name="${dropdownName}"><option value=""></option>${options.map(option => `<option value="${option.trim()}">${option.trim()}</option>`).join('')}</select>`;
  }


  /**
   * Generates dynamic HTML content by parsing short codes within the provided text.
   * This function identifies special short code segments and replaces them with HTML dropdowns.
   * https://learn.maproulette.org/en-us/documentation/challenge-instructions-templating/
   *
   * Example input:
   * "[select &quot;dropdownName&quot; values=&quot;option1,option2,option3&quot;]"
   *
   * @param {string} text The text containing short codes to be transformed into HTML content.
   * @returns {string} The transformed text with HTML content.
   */
  function generateDynamicContent(text) {
    const segments = text.split(/\[select\s+&quot;\s*[^"]*?\s*&quot;\s+name=&quot;/);
    let transformedText = segments[0];
    segments.slice(1).forEach(segment => {
      const endIndex = segment.indexOf('&quot;');
      const dropdownName = segment.substring(0, endIndex);
      const valuesStart = segment.indexOf('values=&quot;') + 'values=&quot;'.length;
      const valuesEnd = segment.indexOf('&quot;', valuesStart);
      const options = segment.substring(valuesStart, valuesEnd).split(',');
      const dropdownHtml = generateDropdownHtml(dropdownName, options);
      const remainder = segment.substring(valuesEnd + '&quot;'.length).trim().replace(/^\]/, '');
      transformedText += dropdownHtml + remainder;
    });
    return transformedText;
  }


  /**
   * This function searches for mustache tags defined by double curly braces (e.g., {{propertyName}}) and replaces them
   * with actual values from the task's properties or generates clickable links if the property is an OSM identifier.
   * https://learn.maproulette.org/en-us/documentation/mustache-tag-replacement/#content
   * @param {string} text The text containing mustache tags to be replaced.
   * @param {Object} task The task object containing properties that may replace the tags.
   * @return {string} The text with mustache tags replaced by actual values or links.
   */
  function replaceMustacheTags(text, task) {
    const tagRegex = /\{\{([\w:]+)\}\}/g;
    return text.replace(tagRegex, (match, propertyName) => {
      // Check if the property name is 'osmIdentifier' and task has a title
      if (propertyName === 'osmIdentifier' && task.title) {
        // Extract the OSM ID including the prefix from the task's title
        const osmId = task.title.split('@')[0];
        // Return an anchor tag with a class for highlighting and data attribute for the OSM ID
        return `<a href="#" class="highlight-link" data-osm-id="${osmId}">${osmId}</a>`;
      }
      // For other properties, return their values from the task if they exist
      if (task.properties && task.properties.hasOwnProperty(propertyName)) {
        return task.properties[propertyName];
      }
      // Return an empty string if the property does not exist in the task
      return '';
    });
  }


  /**
   * Highlights or selects the OpenStreetMap (OSM) feature based on the provided identifier.
   * This function is designed to interact with a mapping context to visually highlight or select
   * an OSM feature on a map. It extracts the necessary part of the OSM identifier, which includes
   * a prefix indicating the type of feature (e.g., 'n' for nodes, 'w' for ways), and uses this
   * identifier to instruct the mapping context to highlight the corresponding feature.
   *
   * @param {string} osmIdentifier Example format: 'n123456@1' where 'n' indicates a node.
   */
  function highlightFeature(osmIdentifier) {
    const idPart = osmIdentifier.split('@')[0]; // Retains the 'n' or 'w' prefix and removes the version
    // Pass the full ID including the prefix to the selection context
    context.enter('select-osm', {
      selection: { osm: [idPart] }
    });
  }


  /**
   * Renders the MapRoulette challenge details into the provided D3 selection.
   * This function handles the dynamic display of challenge details including IDs, descriptions,
   * and instructions, and sets up the necessary event listeners for interactive elements.
   * It fetches task details asynchronously and updates the DOM based on the fetched data.
   *
   * @param {d3.selection} selection The D3 selection where the challenge details should be rendered.
   */
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

      const description = generateDynamicContent(replaceMustacheTags(task.description, task));
      const instruction = generateDynamicContent(replaceMustacheTags(task.instruction, task));
      if (task.description) {
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

      if (task.instruction && task.instruction !== task.description) {
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
          utilHighlightEntities([osmId], false, context);
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