export function uiMapRouletteDetails(context) {
  const l10n = context.systems.l10n;
  const maproulette = context.services.maproulette;

  let _qaItem;

  function parseShortCodes(text) {
    console.log('Original Text:', text); // Debug: log original text
    // working
    // <p>Instructions: [select &quot; &quot; name=&quot;Instructions&quot;

    // not working
    //<p>Matching: [select &quot; &quot; name=&quot;Matching&quot;
    const selectRegex = /\[select\s+&quot;\s*&quot;\s+name=&quot;([^&]+)&quot;\s+values=&quot;([^&]+)&quot;\]/g;
    text = text.replace(selectRegex, (match, name, values) => {
      const options = values.split(',').map(value => `<option value="${value.trim()}">${value.trim()}</option>`).join('');
      return `<select name="${name}"><option value=""></option>${options}</select>`;
    });
    console.log('Transformed Text:', text); // Debug: log transformed text
    return text;
  }


  function replaceMustacheTags(text, properties) {
    // Regex to find mustache tags in the text
    const tagRegex = /\{\{(\w+)\}\}/g;

    // Replace each tag with the corresponding property value
    return text.replace(tagRegex, (propertyName) => {
      // Check if the property exists in the provided properties object
      if (properties && properties.hasOwnProperty(propertyName)) {
        return properties[propertyName];
      }
      // If the property doesn't exist, replace with empty text
      return '';
    });
  }


  function render(selection) {
    let details = selection.selectAll('.error-details')
      .data(_qaItem ? [_qaItem] : [], d => d.key);
    details.exit()
      .remove();
    const detailsEnter = details.enter()
      .append('div')
      .attr('class', 'error-details qa-details-container');
    detailsEnter
      .append('div')
      .attr('class', 'qa-details-subsection')
      .text(l10n.t('map_data.layers.maproulette.loading_task_details'));
    details = details.merge(detailsEnter);
    maproulette.loadTaskDetailAsync(_qaItem)
      .then(task => {
        // Do nothing if _qaItem has changed by the time Promise resolves
        if (_qaItem.id !== task.id) return;
        const selection = details.selectAll('.qa-details-subsection');
        selection.html('');   // replace contents
        // First replace mustache tags, then parse short codes
        const description = parseShortCodes(replaceMustacheTags(task.description, task.properties));
        const instruction = parseShortCodes(replaceMustacheTags(task.instruction, task.properties));
        if (task.description && !task.description.includes('Lorem')) {
          selection
            .append('h4')
            .text(l10n.t('map_data.layers.maproulette.detail_title'));

          selection
            .append('p')
            .html(description)  // parsed markdown
            .selectAll('a').attr('rel', 'noopener')
            .attr('target', '_blank');
        }
        if (task.instruction && !task.instruction.includes('Lorem') && task.instruction !== task.description) {
          selection
            .append('h4')
            .text(l10n.t('map_data.layers.maproulette.instruction_title'));
          selection
            .append('p')
            .html( instruction) // parsed markdown
            .selectAll('a')
            .attr('rel', 'noopener')
            .attr('target', '_blank');
        }
      })
      .catch(e => console.error(e));  // eslint-disable-line
  }


  render.task = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return render;
  };


  return render;
}
