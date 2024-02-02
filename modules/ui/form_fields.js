import { select as d3_select } from 'd3-selection';

import { uiCombobox } from './combobox.js';
import { utilGetSetValue, utilNoAuto } from '../util/index.js';


export function uiFormFields(context) {
  const l10n = context.systems.l10n;
  let moreCombo = uiCombobox(context, 'more-fields').minItems(1);
  let _uifields = [];
  let _lastPlaceholder = '';
  let _state = '';
  let _klass = '';


  function formFields(selection) {
    const allowedFields = _uifields.filter(uifield => uifield.isAllowed());
    const shown = allowedFields.filter(uifield => uifield.isShown());
    const notShown = allowedFields.filter(uifield => !uifield.isShown());

    let container = selection.selectAll('.form-fields-container')
      .data([0]);

    container = container.enter()
      .append('div')
      .attr('class', 'form-fields-container ' + (_klass || ''))
      .merge(container);


    let fields = container.selectAll('.wrap-form-field')
      .data(shown, d => (d.id + (d.entityIDs ? d.entityIDs.join() : '')));

    fields.exit()
      .remove();

    // Enter
    let enter = fields.enter()
      .append('div')
      .attr('class', d => `wrap-form-field wrap-form-field-${d.safeid}`);

    // Update
    fields = fields
      .merge(enter);

    fields
      .order()
      .each((d, i, nodes) => {
        d3_select(nodes[i]).call(d.render);
      });


    let titles = [];
    let moreFields = notShown.map(uifield => {
      const title = uifield.title;
      titles.push(title);

      let terms = uifield.terms;
      if (uifield.key)  terms.push(uifield.key);
      if (uifield.keys) terms = terms.concat(uifield.keys);

      return {
        display: uifield.label,
        value: title,
        title: title,
        field: uifield,
        terms: terms
      };
    });


    let placeholder = titles.slice(0,3).join(', ') + ((titles.length > 3) ? '…' : '');

    let more = selection.selectAll('.more-fields')
      .data((_state === 'hover' || moreFields.length === 0) ? [] : [0]);

    more.exit()
      .remove();

    let moreEnter = more.enter()
      .append('div')
      .attr('class', 'more-fields')
      .append('label');

    moreEnter
      .append('span')
      .text(l10n.t('inspector.add_fields'));

    more = moreEnter
      .merge(more);


    let input = more.selectAll('.value')
      .data([0]);

    input.exit()
      .remove();

    input = input.enter()
      .append('input')
      .attr('class', 'value')
      .attr('type', 'text')
      .attr('placeholder', placeholder)
      .call(utilNoAuto)
      .merge(input);

    input
      .call(utilGetSetValue, '')
      .call(moreCombo
        .data(moreFields)
        .on('accept', d => {
          if (!d) return;  // user entered something that was not matched
          const uifield = d.field;
          uifield.show();
          selection.call(formFields);  // rerender
          uifield.focus();
        })
      );

    // avoid updating placeholder excessively (triggers style recalc)
    if (_lastPlaceholder !== placeholder) {
      input.attr('placeholder', placeholder);
      _lastPlaceholder = placeholder;
    }
  }


  formFields.fieldsArr = function(val) {
    if (!arguments.length) return _uifields;
    _uifields = val || [];
    return formFields;
  };

  formFields.state = function(val) {
    if (!arguments.length) return _state;
    _state = val;
    return formFields;
  };

  formFields.klass = function(val) {
    if (!arguments.length) return _klass;
    _klass = val;
    return formFields;
  };


  return formFields;
}
