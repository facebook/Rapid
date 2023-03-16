import { utilSafeString } from '@rapid-sdk/util';

import { localizer, t } from '../core/localizer';


//
// `presetField` decorates a given `field` Object
// with some extra methods for searching and matching geometry
//
export function presetField(fieldID, field, allFields) {
  allFields = allFields || {};
  let _this = Object.assign({}, field);   // shallow copy

  _this.id = fieldID;

  // for use in classes, element ids, css selectors
  _this.safeid = utilSafeString(fieldID);

  _this.matchGeometry = (geom) => !_this.geometry || _this.geometry.indexOf(geom) !== -1;

  _this.matchAllGeometry = (geometries) => {
    return !_this.geometry || geometries.every(geom => _this.geometry.indexOf(geom) !== -1);
  };

  _this.t = (scope, options) => t(`_tagging.presets.fields.${fieldID}.${scope}`, options);
  _this.t.html = (scope, options) => t.html(`_tagging.presets.fields.${fieldID}.${scope}`, options);
  _this.t.append = (scope, options) => t.append(`_tagging.presets.fields.${fieldID}.${scope}`, options);
  _this.hasTextForStringId = (scope) => localizer.hasTextForStringId(`_tagging.presets.fields.${fieldID}.${scope}`);

  _this.resolveReference = (prop) => {
    const referenceRegex = /^\{(.*)\}$/;
    const match = (field[prop] || '').match(referenceRegex);
    if (match) {
      const field = allFields[match[1]];
      if (field) {
        return field;
      }
      console.error(`Unable to resolve referenced field: ${match[1]}`);  // eslint-disable-line no-console
    }
    return _this;
  };

  _this.title = () => _this.resolveReference('label').t('label', { 'default': fieldID });
  _this.label = () => _this.resolveReference('label').t.html('label', { 'default': fieldID });
  // _this.label = () => _this.resolveReference('label').t.append('label', { 'default': fieldID });  // someday?

  _this.originalPlaceholder = (_this.placeholder || '');
  _this.placeholder = () => _this.resolveReference('placeholder').t('placeholder', { 'default': _this.originalPlaceholder });

  _this.originalTerms = (_this.terms || []).join();
  _this.terms = () => _this.resolveReference('label').t('terms', { 'default': _this.originalTerms })
    .toLowerCase().trim().split(/\s*,+\s*/);

  _this.increment = _this.type === 'number' ? (_this.increment || 1) : undefined;

  return _this;
}
