import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { Extent, geoSphericalDistance } from '@rapid-sdk/math';
import { utilArrayUniqBy } from '@rapid-sdk/util';
import * as countryCoder from '@rapideditor/country-coder';

import { geoChooseEdge } from '../../geo';
import { uiCombobox } from '../combobox';
import { utilGetSetValue, utilNoAuto, utilRebind } from '../../util';


export function uiFieldAddress(context, uifield) {
  const dispatch = d3_dispatch('change');
  let _selection = d3_select(null);
  let _wrap = d3_select(null);

  let _entityIDs = [];
  let _tags;
  let _countryCode;
  let _addressFormats = [{
    format: [
      ['housenumber', 'street'],
      ['city', 'postcode']
    ]
  }];

  const dataLoaderSystem = context.dataLoaderSystem();
  dataLoaderSystem.get('address_formats')
    .then(d => {
      _addressFormats = d;
      if (!_selection.empty()) {
        _selection.call(address);  // rerender
      }
    })
    .catch(e => console.error(e));  // eslint-disable-line


  function getNearbyStreets() {
    const center = uifield.entityExtent.center();
    const box = new Extent(center).padByMeters(200);

    const streets = context.editSystem().intersects(box)
      .filter(isAddressableStreet)
      .map(d => {
        const loc = context.projection.project(center);
        const choice = geoChooseEdge(context.graph().childNodes(d), loc, context.projection);
        return {
          title: d.tags.name,
          value: d.tags.name,
          dist: choice.distance
        };
      })
      .sort((a, b) => a.dist - b.dist);

    return utilArrayUniqBy(streets, 'value');

    function isAddressableStreet(d) {
      return d.tags.highway && d.tags.name && d.type === 'way';
    }
  }


  function getNearbyCities() {
    const center = uifield.entityExtent.center();
    const box = new Extent(center).padByMeters(200);

    const cities = context.editSystem().intersects(box)
      .filter(isAddressableCity)
      .map(d => {
        return {
          title: d.tags['addr:city'] || d.tags.name,
          value: d.tags['addr:city'] || d.tags.name,
          dist: geoSphericalDistance(d.extent(context.graph()).center(), center)
        };
      })
      .sort((a, b) => a.dist - b.dist);

    return utilArrayUniqBy(cities, 'value');

    function isAddressableCity(d) {
      if (d.tags.name) {
        if (d.tags.admin_level === '8' && d.tags.boundary === 'administrative') return true;
        if (d.tags.border_type === 'city') return true;
        if (d.tags.place === 'city' || d.tags.place === 'town' || d.tags.place === 'village') return true;
      }

      if (d.tags['addr:city']) return true;

      return false;
    }
  }


  // Suggest values that are used by other nearby entities
  function getNearbyValues(key) {
    const center = uifield.entityExtent.center();
    const box = new Extent(center).padByMeters(200);

    const results = context.editSystem().intersects(box)
      .filter(entityHasAddressTag)
      .map(d => {
        return {
          title: d.tags[key],
          value: d.tags[key],
          dist: geoSphericalDistance(d.extent(context.graph()).center(), center)
        };
      })
      .sort((a, b) => a.dist - b.dist);

    return utilArrayUniqBy(results, 'value');

    function entityHasAddressTag(d) {
      return !_entityIDs.includes(d.id) && d.tags[key];
    }
  }


  function updateForCountryCode() {
    if (!_countryCode) return;

    let addressFormat;
    for (let i = 0; i < _addressFormats.length; i++) {
      let format = _addressFormats[i];
      if (!format.countryCodes) {
        addressFormat = format;   // choose the default format, keep going
      } else if (format.countryCodes.includes(_countryCode)) {
        addressFormat = format;   // choose the country format, stop here
        break;
      }
    }

    const dropdowns = addressFormat.dropdowns || [
      'city', 'county', 'country', 'district', 'hamlet',
      'neighbourhood', 'place', 'postcode', 'province',
      'quarter', 'state', 'street', 'subdistrict', 'suburb'
    ];

    const widths = addressFormat.widths || {
      housenumber: 1/3, street: 2/3,
      city: 2/3, state: 1/4, postcode: 1/3
    };

    function row(r) {
      // Normalize widths.
      const total = r.reduce((sum, key) => {
        return sum + (widths[key] || 0.5);
      }, 0);

      return r.map(key => {
        return {
          id: key,
          width: (widths[key] || 0.5) / total
        };
      });
    }

    let rows = _wrap.selectAll('.addr-row')
      .data(addressFormat.format, d => d.toString());

    rows.exit()
      .remove();

    rows
      .enter()
      .append('div')
      .attr('class', 'addr-row')
      .selectAll('input')
      .data(row)
      .enter()
      .append('input')
      .property('type', 'text')
      .call(updatePlaceholder)
      .attr('class', d => `addr-${d.id}`)
      .call(utilNoAuto)
      .each(addDropdown)
      .style('width', d => (d.width * 100) + '%');


    function addDropdown(d) {
      if (!dropdowns.includes(d.id)) return;  // not a dropdown

      const getValues = (d.id === 'street') ? getNearbyStreets
        : (d.id === 'city') ? getNearbyCities
        : getNearbyValues;

      d3_select(this)
        .call(uiCombobox(context, `address-${d.id}`)
          .minItems(1)
          .caseSensitive(true)
          .fetcher(function(value, callback) {
            callback(getValues(`addr:${d.id}`));
          })
        );
    }

    _wrap.selectAll('input')
      .on('blur', change())
      .on('change', change());

    _wrap.selectAll('input:not(.combobox-input)')
      .on('input', change(true));

    if (_tags) updateTags(_tags);
  }


  function address(selection) {
    _selection = selection;

    _wrap = selection.selectAll('.form-field-input-wrap')
      .data([0]);

    _wrap = _wrap.enter()
      .append('div')
      .attr('class', `form-field-input-wrap form-field-input-${uifield.type}`)
      .merge(_wrap);

    const center = uifield.entityExtent.center();
    let countryCode;
    if (context.inIntro) {  // localize the address format for the walkthrough
      countryCode = context.t('intro.graph.countrycode');
    } else {
      countryCode = countryCoder.iso1A2Code(center);
    }
    if (countryCode) {
      _countryCode = countryCode.toLowerCase();
      updateForCountryCode();
    }
  }


  function change(onInput) {
    return function() {
      let tagChange = {};
      _wrap.selectAll('input')
        .each((subfield, i, nodes) => {
          const node = nodes[i];
          const key = uifield.key + ':' + subfield.id;
          const value = onInput ? node.value : context.cleanTagValue(node.value);

          // don't override multiple values with blank string
          if (Array.isArray(_tags[key]) && !value) return;

          tagChange[key] = value || undefined;
        });

      dispatch.call('change', this, tagChange, onInput);
    };
  }


  function updatePlaceholder(inputSelection) {
    return inputSelection.attr('placeholder', function(subfield) {
      const key = uifield.key + ':' + subfield.id;
      if (_tags && Array.isArray(_tags[key])) {
        return context.t('inspector.multiple_values');
      }
      if (_countryCode) {
        const localkey = subfield.id + '!' + _countryCode;
        const tkey = uifield.hasTextForStringID('placeholders.' + localkey) ? localkey : subfield.id;
        return uifield.presetField.t(`placeholders.${tkey}`);
      }
    });
  }


  function updateTags(tags) {
    utilGetSetValue(_wrap.selectAll('input'), function(subfield) {
        const key = uifield.key + ':' + subfield.id;
        const val = tags[key];
        return typeof val === 'string' ? val : '';
      })
      .attr('title', subfield => {
        const key = uifield.key + ':' + subfield.id;
        const val = tags[key];
        return val && Array.isArray(val) && val.filter(Boolean).join('\n');
      })
      .classed('mixed', subfield => {
        const key = uifield.key + ':' + subfield.id;
        return Array.isArray(tags[key]);
      })
      .call(updatePlaceholder);
  }


  address.entityIDs = function(val) {
    if (!arguments.length) return _entityIDs;
    _entityIDs = val;
    return address;
  };


  address.tags = function(tags) {
    _tags = tags;
    updateTags(tags);
  };


  address.focus = function() {
    let node = _wrap.selectAll('input').node();
    if (node) node.focus();
  };


  return utilRebind(address, dispatch, 'on');
}
