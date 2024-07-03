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
      // Special handling for 'osmIdentifier' which uses the 'title' field
      if (propertyName === 'osmIdentifier') {
        if (task.title) {
          return task.title;
        } else {
          return '';
        }
      }
      // Handle other properties expected in 'properties' object
      if (task.properties && task.properties.hasOwnProperty(propertyName)) {
        return task.properties[propertyName];
      }
      return '';
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
      if (!task) {
        return;
      }
      if (_qaItem.id !== task.id) {
        return;
      }

      const description = parseShortCodes(replaceMustacheTags(task.description, task));
      const instruction = parseShortCodes(replaceMustacheTags(task.instruction, task));
      const selection = details.selectAll('.qa-details-subsection');
      selection.html(''); // Clear previous contents
      selection.append('div').html(description);
      selection.append('div').html(instruction);
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