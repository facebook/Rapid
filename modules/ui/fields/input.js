import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { iso1A2Code } from '@rapideditor/country-coder';

import { utilGetSetValue, utilNoAuto, utilRebind } from '../../util/index.js';
import { uiIcon } from '../icon.js';

export {
  uiFieldText as uiFieldUrl,
  uiFieldText as uiFieldIdentifier,
  uiFieldText as uiFieldNumber,
  uiFieldText as uiFieldTel,
  uiFieldText as uiFieldEmail
};


export function uiFieldText(context, uifield) {
  const assets = context.systems.assets;
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const presets = context.systems.presets;
  const dispatch = d3_dispatch('change');

  let input = d3_select(null);
  let outlinkButton = d3_select(null);
  let _entityIDs = [];
  let _tags;
  let _phoneFormats = {};

  if (uifield.type === 'tel') {
    assets.loadAssetAsync('phone_formats')
      .then(d => {
        _phoneFormats = d.phoneFormats;
        updatePhonePlaceholder();
      })
      .catch(e => console.error(e));  // eslint-disable-line
  }


  function calcLocked() {
    const graph = editor.staging.graph;
    // Protect certain fields that have a companion `*:wikidata` value
    const lockable = ['brand', 'network', 'operator', 'flag'];
    const isLocked = lockable.includes(uifield.id) && _entityIDs.length && _entityIDs.some(entityID => {
      const entity = graph.hasEntity(entityID);
      if (!entity) return false;

      // Features linked to Wikidata are likely important and should be protected
      if (entity.tags.wikidata) return true;

      const preset = presets.match(entity, graph);
      const isSuggestion = preset?.suggestion;

      // Lock the field if there is a value and a companion `*:wikidata` value
      const which = uifield.id;   // 'brand', 'network', 'operator', 'flag'
      return isSuggestion && !!entity.tags[which] && !!entity.tags[which + ':wikidata'];
    });

    uifield.locked(isLocked);
  }


  function i(selection) {
    const presetField = uifield.presetField;

    calcLocked();
    let isLocked = uifield.locked();

    let wrap = selection.selectAll('.form-field-input-wrap')
      .data([0]);

    wrap = wrap.enter()
      .append('div')
      .attr('class', `form-field-input-wrap form-field-input-${uifield.type}`)
      .merge(wrap);

    input = wrap.selectAll('input')
      .data([0]);

    input = input.enter()
      .append('input')
      .attr('type', uifield.type === 'identifier' || uifield.type === 'roadheight' ? 'text' : uifield.type)
      .attr('id', uifield.uid)
      .classed(uifield.type, true)
      .call(utilNoAuto)
      .merge(input);

    input
      .classed('disabled', !!isLocked)
      .attr('readonly', isLocked || null)
      .on('input', change(true))
      .on('blur', change())
      .on('change', change());


    if (uifield.type === 'tel') {
      updatePhonePlaceholder();

    } else if (uifield.type === 'number') {
      input.attr('type', 'text');

      const inc = presetField.increment() ?? 1;
      let buttons = wrap.selectAll('.increment, .decrement')
        .data(l10n.isRTL() ? [inc, -inc] : [-inc, inc]);

      buttons.enter()
        .append('button')
        .attr('class', function(d) {
          const which = (d > 0) ? 'increment' : 'decrement';
          return `form-field-button ${which}`;
        })
        .merge(buttons)
        .on('click', function(d3_event, d) {
          d3_event.preventDefault();
          const raw_vals = input.node().value || '0';
          let vals = raw_vals.split(';');
          vals = vals.map(v => {
            const num = parseFloat(v.trim(), 10);
            return isFinite(num) ? clamped(num + d) : v.trim();
          });
          input.node().value = vals.join(';');
          change()();
        });

    } else if (uifield.type === 'identifier' && presetField.urlFormat && presetField.pattern) {
      input.attr('type', 'text');

      outlinkButton = wrap.selectAll('.foreign-id-permalink')
        .data([0]);

      outlinkButton.enter()
        .append('button')
        .call(uiIcon('#rapid-icon-out-link'))
        .attr('class', 'form-field-button foreign-id-permalink')
        .attr('title', function() {
          const domainResults = /^https?:\/\/(.{1,}?)\//.exec(presetField.urlFormat);
          if (domainResults.length >= 2 && domainResults[1]) {
            const domain = domainResults[1];
            return l10n.t('icons.view_on', { domain: domain });
          }
          return '';
        })
        .on('click', function(d3_event) {
          d3_event.preventDefault();
          const value = validIdentifierValueForLink();
          if (value) {
            const url = presetField.urlFormat.replace(/{value}/, encodeURIComponent(value));
            window.open(url, '_blank');
          }
        })
        .merge(outlinkButton);

    } else if (uifield.type === 'url') {
      input.attr('type', 'text');

      outlinkButton = wrap.selectAll('.foreign-id-permalink')
        .data([0]);

      outlinkButton.enter()
        .append('button')
        .call(uiIcon('#rapid-icon-out-link'))
        .attr('class', 'form-field-button foreign-id-permalink')
        .attr('title', () => l10n.t('icons.visit_website'))
        .on('click', function(d3_event) {
          d3_event.preventDefault();
          const value = validIdentifierValueForLink();
          if (value) window.open(value, '_blank');
        })
        .merge(outlinkButton);
    }
  }


  function updatePhonePlaceholder() {
    if (input.empty() || !Object.keys(_phoneFormats).length) return;

    const extent = uifield.entityExtent;
    const countryCode = extent && iso1A2Code(extent.center());
    const format = countryCode && _phoneFormats[countryCode.toLowerCase()];
    if (format) input.attr('placeholder', format);
  }


  function validIdentifierValueForLink() {
    const pattern = uifield.presetField.pattern;
    const value = utilGetSetValue(input).trim().split(';')[0];

    if (uifield.type === 'url' && /^https?:\/\//i.test(value)) return value;
    if (uifield.type === 'identifier' && pattern) {
      return value && value.match(new RegExp(pattern));
    }
    return null;
  }


  // clamp number to min/max
  function clamped(num) {
    const presetField = uifield.presetField;
    if (presetField.minValue !== undefined) {
      num = Math.max(num, presetField.minValue);
    }
    if (presetField.maxValue !== undefined) {
      num = Math.min(num, presetField.maxValue);
    }
    return num;
  }


  function change(onInput) {
    return function() {
      const key = uifield.key;
      let tagChange = {};
      let val = utilGetSetValue(input);
      if (!onInput) val = context.cleanTagValue(val);

      // don't override multiple values with blank string
      if (!val && Array.isArray(_tags[key])) return;

      if (!onInput) {
        if (uifield.type === 'number' && val) {
          let vals = val.split(';');
          vals = vals.map(v => {
            const num = parseFloat(v.trim(), 10);
            return isFinite(num) ? clamped(num) : v.trim();
          });
          val = vals.join(';');
        }
        utilGetSetValue(input, val);
      }
      tagChange[key] = val || undefined;
      dispatch.call('change', this, tagChange, onInput);
    };
  }


  i.entityIDs = function(val) {
    if (!arguments.length) return _entityIDs;
    _entityIDs = val;
    return i;
  };


  i.tags = function(tags) {
    _tags = tags;
    const key = uifield.key;
    const isMixed = Array.isArray(tags[key]);

    utilGetSetValue(input, !isMixed && tags[key] ? tags[key] : '')
      .attr('title', isMixed ? tags[key].filter(Boolean).join('\n') : undefined)
      .attr('placeholder', isMixed ? l10n.t('inspector.multiple_values') : (uifield.placeholder || l10n.t('inspector.unknown')))
      .classed('mixed', isMixed);

    if (outlinkButton && !outlinkButton.empty()) {
      const disabled = !validIdentifierValueForLink();
      outlinkButton.classed('disabled', disabled);
    }
  };


  i.focus = function() {
    const node = input.node();
    if (node) node.focus();
  };

  return utilRebind(i, dispatch, 'on');
}
