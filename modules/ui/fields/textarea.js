import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { utilGetSetValue, utilNoAuto, utilRebind } from '../../util/index.js';


export function uiFieldTextarea(context, uifield) {
  const l10n = context.systems.l10n;
  const dispatch = d3_dispatch('change');

  let input = d3_select(null);
  let _tags;


  function textarea(selection) {
    let wrap = selection.selectAll('.form-field-input-wrap')
      .data([0]);

    wrap = wrap.enter()
      .append('div')
      .attr('class', `form-field-input-wrap form-field-input-${uifield.type}`)
      .merge(wrap);

    input = wrap.selectAll('textarea')
      .data([0]);

    input = input.enter()
      .append('textarea')
      .attr('id', uifield.uid)
      .call(utilNoAuto)
      .on('input', change(true))
      .on('blur', change())
      .on('change', change())
      .merge(input);
  }


  function change(onInput) {
    return function() {
      const key = uifield.key;
      let val = utilGetSetValue(input);
      if (!onInput) val = context.cleanTagValue(val);

      // don't override multiple values with blank string
      if (!val && Array.isArray(_tags[key])) return;

      let t = {};
      t[key] = val || undefined;
      dispatch.call('change', this, t, onInput);
    };
  }


  textarea.tags = function(tags) {
    _tags = tags;
    const key = uifield.key;
    const isMixed = Array.isArray(tags[key]);
    const placeholder = isMixed ? l10n.t('inspector.multiple_values') :
      (uifield.placeholder || l10n.t('inspector.unknown'));

    utilGetSetValue(input, !isMixed && tags[key] ? tags[key] : '')
      .attr('title', isMixed ? tags[key].filter(Boolean).join('\n') : undefined)
      .attr('placeholder', placeholder)
      .classed('mixed', isMixed);
  };


  textarea.focus = function() {
    input.node().focus();
  };


  return utilRebind(textarea, dispatch, 'on');
}
