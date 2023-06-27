import { uiSection } from '../section';


export function uiSectionValidationOptions(context) {
  const prefs = context.systems.storage;
  const section = uiSection('issues-options', context)
    .content(renderContent);


  function renderContent(selection) {
    let container = selection.selectAll('.issues-options-container')
      .data([0]);

    container = container.enter()
      .append('div')
      .attr('class', 'issues-options-container')
      .merge(container);

    const data = [
      { key: 'what', values: ['edited', 'all'] },
      { key: 'where', values: ['visible', 'all'] }
    ];

    let options = container.selectAll('.issues-option')
      .data(data, d => d.key);

    let optionsEnter = options.enter()
      .append('div')
      .attr('class', d => `issues-option issues-option-${d.key}`);

    optionsEnter
      .append('div')
      .attr('class', 'issues-option-title')
      .html(d => context.tHtml(`issues.options.${d.key}.title`));

    let valuesEnter = optionsEnter.selectAll('label')
      .data(d => {
        return d.values.map(val => ({ value: val, key: d.key }) );
      })
      .enter()
      .append('label');

    valuesEnter
      .append('input')
      .attr('type', 'radio')
      .attr('name', d => `issues-option-${d.key}`)
      .attr('value', d => d.value)
      .property('checked', d => getOptions()[d.key] === d.value)
      .on('change', (d3_event, d) => updateOptionValue(d3_event, d.key, d.value));

    valuesEnter
      .append('span')
      .html(d => context.tHtml(`issues.options.${d.key}.${d.value}`));
  }

  function getOptions() {
    return {
      what: prefs.getItem('validate-what') || 'edited',  // 'all', 'edited'
      where: prefs.getItem('validate-where') || 'all'    // 'all', 'visible'
    };
  }

  function updateOptionValue(d3_event, d, val) {
    if (!val && d3_event && d3_event.target) {
      val = d3_event.target.value;
    }

    prefs.setItem(`validate-${d}`, val);
    context.systems.validator.validate();
  }

  return section;
}
