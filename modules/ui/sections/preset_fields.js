import { dispatch as d3_dispatch } from 'd3-dispatch';
import { utilArrayIdentical, utilArrayUnion } from '@rapid-sdk/util';

import { UiField } from '../UiField.js';
import { uiFormFields } from '../form_fields.js';
import { uiSection } from '../section.js';
import { utilRebind } from '../../util/index.js';


export function uiSectionPresetFields(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const presets = context.systems.presets;

  let section = uiSection(context, 'preset-fields')
    .label(l10n.t('inspector.fields'))
    .disclosureContent(renderDisclosureContent);

  const dispatch = d3_dispatch('change', 'revert');
  const formFields = uiFormFields(context);
  let _state;    // can be 'hide', 'hover', or 'select'
  let _uifields;
  let _presets = [];
  let _tags;
  let _entityIDs;


  function renderDisclosureContent(selection) {
    if (!_uifields) {
      const graph = editor.staging.graph;

      const geometries = Object.keys(_entityIDs.reduce((geoms, entityID) => {
        geoms[graph.entity(entityID).geometry(graph)] = true;
        return geoms;
      }, {}));

      let allFields = [];
      let allMoreFields = [];
      let sharedTotalFields;

      for (const preset of _presets) {
        let fields = preset.fields();
        let moreFields = preset.moreFields();

        allFields = utilArrayUnion(allFields, fields);
        allMoreFields = utilArrayUnion(allMoreFields, moreFields);

        if (!sharedTotalFields) {
          sharedTotalFields = utilArrayUnion(fields, moreFields);
        } else {
          sharedTotalFields = sharedTotalFields.filter(field => {
            return fields.includes(field) || moreFields.includes(field);
          });
        }
      }

      const sharedFields = allFields.filter(field => sharedTotalFields.includes(field));
      const sharedMoreFields = allMoreFields.filter(field => sharedTotalFields.includes(field));

      _uifields = [];
      for (const field of sharedFields) {
        if (field.matchAllGeometry(geometries)) {
          _uifields.push(new UiField(context, field, _entityIDs));
        }
      }

//    let singularEntity = _entityIDs.length === 1 && graph.hasEntity(_entityIDs[0]);
//    if (singularEntity && singularEntity.isHighwayIntersection(graph) && presets.field('restrictions')) {
//      _uifields.push(new UiField(context, presets.field('restrictions'), _entityIDs));
//    }

      const localeCode = l10n.localeCode();
      let additionalFields = utilArrayUnion(sharedMoreFields, presets.universal());
      additionalFields.sort((field1, field2) => {
        return field1.label().localeCompare(field2.label(), localeCode);
      });

      for (const field of additionalFields) {
        if (!sharedFields.includes(field) && field.matchAllGeometry(geometries)) {
          _uifields.push(new UiField(context, field, _entityIDs, { show: false }) );
        }
      }

      const ids = _entityIDs.slice();  // make copy (eslint warning)
      for (const uifield of _uifields) {
        uifield.on('change', (t, onInput) => {
          dispatch.call('change', uifield, ids, t, onInput);
        });
        uifield.on('revert', (keys) => {
          dispatch.call('revert', uifield, keys);
        });
      }
    }

    for (const uifield of _uifields) {
      uifield.state(_state).tags(_tags);
    }


    selection
      .call(formFields
        .fieldsArr(_uifields)
        .state(_state)
        .klass('grouped-items-area')
      );


    selection.selectAll('.wrap-form-field input')
      .on('keydown', function(d3_event) {
        // if user presses enter, and combobox is not active, accept edits..
        if (d3_event.keyCode === 13 && context.container().select('.combobox').empty()) {   // ↩ Return
          context.enter('browse');
        }
      });
  }

  section.presets = function(val) {
    if (!arguments.length) return _presets;
    if (!_presets || !val || !utilArrayIdentical(_presets, val)) {
      _presets = val;
      _uifields = null;
    }
    return section;
  };

  section.state = function(val) {
    if (!arguments.length) return _state;
    _state = val;
    return section;
  };

  section.tags = function(val) {
    if (!arguments.length) return _tags;
    _tags = val;
    // Don't reset _uifields here.
    return section;
  };

  section.entityIDs = function(val) {
    if (!arguments.length) return _entityIDs;
    if (!val || !_entityIDs || !utilArrayIdentical(_entityIDs, val)) {
      _entityIDs = val;
      _uifields = null;
    }
    return section;
  };

  return utilRebind(section, dispatch, 'on');
}
