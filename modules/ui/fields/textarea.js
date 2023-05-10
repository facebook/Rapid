import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { utilGetSetValue, utilNoAuto, utilRebind } from '../../util';


export function uiFieldTextarea(context, uifield) {
    var dispatch = d3_dispatch('change');
    var input = d3_select(null);
    var _tags;


    function textarea(selection) {
        var wrap = selection.selectAll('.form-field-input-wrap')
            .data([0]);

        wrap = wrap.enter()
            .append('div')
            .attr('class', 'form-field-input-wrap form-field-input-' + uifield.type)
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
            let key = uifield.key;
            var val = utilGetSetValue(input);
            if (!onInput) val = context.cleanTagValue(val);

            // don't override multiple values with blank string
            if (!val && Array.isArray(_tags[key])) return;

            var t = {};
            t[key] = val || undefined;
            dispatch.call('change', this, t, onInput);
        };
    }


    textarea.tags = function(tags) {
        _tags = tags;
        let key = uifield.key;
        var isMixed = Array.isArray(tags[key]);

        utilGetSetValue(input, !isMixed && tags[key] ? tags[key] : '')
            .attr('title', isMixed ? tags[key].filter(Boolean).join('\n') : undefined)
            .attr('placeholder', isMixed ? t('inspector.multiple_values') : (uifield.placeholder || t('inspector.unknown')))
            .classed('mixed', isMixed);
    };


    textarea.focus = function() {
        input.node().focus();
    };


    return utilRebind(textarea, dispatch, 'on');
}
