import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { roadSpeedUnit } from '@rapideditor/country-coder';

import { uiCombobox } from '../combobox.js';
import { utilGetSetValue, utilNoAuto, utilRebind } from '../../util/index.js';


export function uiFieldRoadspeed(context, uifield) {
    const l10n = context.systems.l10n;
    const dispatch = d3_dispatch('change');

    var unitInput = d3_select(null);
    var input = d3_select(null);
    var _tags;
    var _isImperial;

    var speedCombo = uiCombobox(context, 'roadspeed');
    var unitCombo = uiCombobox(context, 'roadspeed-unit')
            .data(['km/h', 'mph'].map(comboValues));

    var metricValues = [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
    var imperialValues = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];


    function roadspeed(selection) {
        var wrap = selection.selectAll('.form-field-input-wrap')
            .data([0]);

        wrap = wrap.enter()
            .append('div')
            .attr('class', 'form-field-input-wrap form-field-input-' + uifield.type)
            .merge(wrap);


        input = wrap.selectAll('input.roadspeed-number')
            .data([0]);

        input = input.enter()
            .append('input')
            .attr('type', 'text')
            .attr('class', 'roadspeed-number')
            .attr('id', uifield.uid)
            .call(utilNoAuto)
            .call(speedCombo)
            .merge(input);

        input
            .on('change', change)
            .on('blur', change);

        var loc = uifield.entityExtent.center();
        _isImperial = roadSpeedUnit(loc) === 'mph';

        unitInput = wrap.selectAll('input.roadspeed-unit')
            .data([0]);

        unitInput = unitInput.enter()
            .append('input')
            .attr('type', 'text')
            .attr('class', 'roadspeed-unit')
            .call(unitCombo)
            .merge(unitInput);

        unitInput
            .on('blur', changeUnits)
            .on('change', changeUnits);


        function changeUnits() {
            _isImperial = utilGetSetValue(unitInput) === 'mph';
            utilGetSetValue(unitInput, _isImperial ? 'mph' : 'km/h');
            setUnitSuggestions();
            change();
        }
    }


    function setUnitSuggestions() {
        speedCombo.data((_isImperial ? imperialValues : metricValues).map(comboValues));
        utilGetSetValue(unitInput, _isImperial ? 'mph' : 'km/h');
    }


    function comboValues(d) {
        return {
            value: d.toString(),
            title: d.toString()
        };
    }


    function change() {
        var tag = {};
        var value = utilGetSetValue(input).trim();
        let key = uifield.key;

        // don't override multiple values with blank string
        if (!value && Array.isArray(_tags[key])) return;

        if (!value) {
            tag[key] = undefined;
        } else if (isNaN(value) || !_isImperial) {
            tag[key] = context.cleanTagValue(value);
        } else {
            tag[key] = context.cleanTagValue(value + ' mph');
        }

        dispatch.call('change', this, tag);
    }


    roadspeed.tags = function(tags) {
        _tags = tags;
        let key = uifield.key;

        var value = tags[key];
        var isMixed = Array.isArray(value);

        if (!isMixed) {
            if (value && value.indexOf('mph') >= 0) {
                value = parseInt(value, 10).toString();
                _isImperial = true;
            } else if (value) {
                _isImperial = false;
            }
        }

        setUnitSuggestions();

        utilGetSetValue(input, typeof value === 'string' ? value : '')
            .attr('title', isMixed ? value.filter(Boolean).join('\n') : null)
            .attr('placeholder', isMixed ? l10n.t('inspector.multiple_values') : uifield.placeholder)
            .classed('mixed', isMixed);
    };


    roadspeed.focus = function() {
        input.node().focus();
    };

    return utilRebind(roadspeed, dispatch, 'on');
}
