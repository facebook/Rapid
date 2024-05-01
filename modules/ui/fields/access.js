import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { uiCombobox } from '../combobox.js';
import { utilGetSetValue, utilNoAuto, utilRebind } from '../../util/index.js';


export function uiFieldAccess(context, uifield) {
  const l10n = context.systems.l10n;
  const dispatch = d3_dispatch('change');
  let items = d3_select(null);
  let _tags;

  function access(selection) {
    let wrap = selection.selectAll('.form-field-input-wrap')
      .data([0]);

    wrap = wrap.enter()
      .append('div')
      .attr('class', `form-field-input-wrap form-field-input-${uifield.type}`)
      .merge(wrap);

    let list = wrap.selectAll('ul')
      .data([0]);

    list = list.enter()
      .append('ul')
      .attr('class', 'rows')
      .merge(list);


    items = list.selectAll('li')
      .data(uifield.keys);

    // Enter
    let enter = items.enter()
      .append('li')
      .attr('class', d => `labeled-input preset-access-${d}`);

    enter
      .append('div')
      .attr('class', 'label preset-label-access')
      .attr('for', d => `preset-input-access-${d}`)
      .html(d => uifield.tHtml(`types.${d}`));

    enter
      .append('div')
      .attr('class', 'preset-input-access-wrap')
      .append('input')
      .attr('type', 'text')
      .attr('class', d => `preset-input-access preset-input-access-${d}`)
      .call(utilNoAuto)
      .each((d, i, nodes) => {
        d3_select(nodes[i])
          .call(uiCombobox(context, `access-${d}`)
            .data(access.options(d))
          );
      });


    // Update
    items = items.merge(enter);

    wrap.selectAll('.preset-input-access')
      .on('change', change)
      .on('blur', change);
  }


  function change(d3_event, d) {
    let tagChange = {};
    const value = context.cleanTagValue(utilGetSetValue(d3_select(this)));

    // don't override multiple values with blank string
    if (!value && typeof _tags[d] !== 'string') return;

    tagChange[d] = value || undefined;
    dispatch.call('change', this, tagChange);
  }


  access.options = function(type) {
    const options = ['no', 'permissive', 'private', 'permit', 'destination'];

    if (type !== 'access') {
      options.unshift('yes');
      options.push('designated');

      if (type === 'bicycle') {
        options.push('dismount');
      }
    }

    return options.map(val => {
      return {
        title: uifield.t(`options.${val}.description`),
        value: val
      };
    });
  };


  const placeholdersByHighway = {
    footway: {
      foot: 'designated',
      motor_vehicle: 'no'
    },
    steps: {
      foot: 'yes',
      motor_vehicle: 'no',
      bicycle: 'no',
      horse: 'no'
    },
    pedestrian: {
      foot: 'yes',
      motor_vehicle: 'no'
    },
    cycleway: {
      motor_vehicle: 'no',
      bicycle: 'designated'
    },
    bridleway: {
      motor_vehicle: 'no',
      horse: 'designated'
    },
    path: {
      foot: 'yes',
      motor_vehicle: 'no',
      bicycle: 'yes',
      horse: 'yes'
    },
    motorway: {
      foot: 'no',
      motor_vehicle: 'yes',
      bicycle: 'no',
      horse: 'no'
    },
    trunk: {
      motor_vehicle: 'yes'
    },
    primary: {
      foot: 'yes',
      motor_vehicle: 'yes',
      bicycle: 'yes',
      horse: 'yes'
    },
    secondary: {
      foot: 'yes',
      motor_vehicle: 'yes',
      bicycle: 'yes',
      horse: 'yes'
    },
    tertiary: {
      foot: 'yes',
      motor_vehicle: 'yes',
      bicycle: 'yes',
      horse: 'yes'
    },
    residential: {
      foot: 'yes',
      motor_vehicle: 'yes',
      bicycle: 'yes',
      horse: 'yes'
    },
    unclassified: {
      foot: 'yes',
      motor_vehicle: 'yes',
      bicycle: 'yes',
      horse: 'yes'
    },
    service: {
      foot: 'yes',
      motor_vehicle: 'yes',
      bicycle: 'yes',
      horse: 'yes'
    },
    motorway_link: {
      foot: 'no',
      motor_vehicle: 'yes',
      bicycle: 'no',
      horse: 'no'
    },
    trunk_link: {
      motor_vehicle: 'yes'
    },
    primary_link: {
      foot: 'yes',
      motor_vehicle: 'yes',
      bicycle: 'yes',
      horse: 'yes'
    },
    secondary_link: {
      foot: 'yes',
      motor_vehicle: 'yes',
      bicycle: 'yes',
      horse: 'yes'
    },
    tertiary_link: {
      foot: 'yes',
      motor_vehicle: 'yes',
      bicycle: 'yes',
      horse: 'yes'
    },
    busway: {
      access: 'no',
      bus: 'designated',
      emergency: 'yes'
    }
  };


  access.tags = function(tags) {
    _tags = tags;

    utilGetSetValue(items.selectAll('.preset-input-access'), d => {
      return typeof tags[d] === 'string' ? tags[d] : '';
    })
      .classed('mixed', d => {
        return tags[d] && Array.isArray(tags[d]);
      })
      .attr('title', d => {
        return tags[d] && Array.isArray(tags[d]) && tags[d].filter(Boolean).join('\n');
      })
      .attr('placeholder', d => {
        if (tags[d] && Array.isArray(tags[d])) {
          return l10n.t('inspector.multiple_values');
        }
        if (d === 'access') {
          return 'yes';
        }
        if (tags.access && typeof tags.access === 'string') {
          return tags.access;
        }
        if (tags.highway) {
          if (typeof tags.highway === 'string') {
            if (placeholdersByHighway[tags.highway] && placeholdersByHighway[tags.highway][d]) {
              return placeholdersByHighway[tags.highway][d];
            }
          } else {
            const impliedAccesses = tags.highway.filter(Boolean).map(highwayVal => {
              return placeholdersByHighway[highwayVal] && placeholdersByHighway[highwayVal][d];
            }).filter(Boolean);

            if (impliedAccesses.length === tags.highway.length && new Set(impliedAccesses).size === 1) {
              // if all the highway values have the same implied access for this type then use that
              return impliedAccesses[0];
            }
          }
        }
        return uifield.placeholder;
      });
  };


  access.focus = function() {
    items.selectAll('.preset-input-access')
      .node().focus();
  };


  return utilRebind(access, dispatch, 'on');
}
