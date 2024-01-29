import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { utilRebind } from '../../util/rebind.js';
import { actionReverse } from '../../actions/reverse.js';
import { osmOneWayTags } from '../../osm/tags.js';
import { uiIcon } from '../icon.js';

export { uiFieldCheck as uiFieldDefaultCheck };
export { uiFieldCheck as uiFieldOnewayCheck };


export function uiFieldCheck(context, uifield) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const dispatch = d3_dispatch('change');

  let values = [];
  let texts = [];

  let input = d3_select(null);
  let text = d3_select(null);
  let label = d3_select(null);
  let reverser = d3_select(null);

  let _tags;
  let _impliedYes;
  let _entityIDs = [];
  let _value;


  // Prepare the values and texts that this checkbox works with
  const options = uifield.presetField.options;
  if (Array.isArray(options)) {
    for (const v of options) {
      values.push(v === 'undefined' ? undefined : v);
      texts.push(uifield.tHtml(`options.${v}`, { 'default': v }));
    }
  } else {
    values = [undefined, 'yes'];
    texts = [l10n.tHtml('inspector.unknown'), l10n.tHtml('inspector.check.yes')];
    if (uifield.type !== 'defaultCheck') {
      values.push('no');
      texts.push(l10n.tHtml('inspector.check.no'));
    }
  }


  // Checks tags to see whether an undefined value is "Assumed to be Yes"
  function checkImpliedYes() {
    _impliedYes = (uifield.id === 'oneway_yes');

    // hack: pretend `oneway` field is a `oneway_yes` field
    // where implied oneway tag exists (e.g. `junction=roundabout`) iD#2220, iD#1841
    if (uifield.id === 'oneway' && _entityIDs.length) {
      const graph = editor.staging.graph;
      const entity = graph.entity(_entityIDs[0]);
      for (let key in entity.tags) {
        if (key in osmOneWayTags && (entity.tags[key] in osmOneWayTags[key])) {
          _impliedYes = true;
          texts[0] = l10n.tHtml('_tagging.presets.fields.oneway_yes.options.undefined');
          break;
        }
      }
    }
  }


  function reverserHidden() {
    if (!context.container().select('div.inspector-hover').empty()) return true;
    return !(_value === 'yes' || (_impliedYes && !_value));
  }


  function reverserSetText(selection) {
    const graph = editor.staging.graph;
    const entity = _entityIDs.length && graph.hasEntity(_entityIDs[0]);
    if (reverserHidden() || !entity) return selection;

    const first = entity.first();
    const last = entity.isClosed() ? entity.nodes[entity.nodes.length - 2] : entity.last();
    const pseudoDirection = first < last;
    const icon = pseudoDirection ? '#rapid-icon-forward' : '#rapid-icon-backward';

    selection.selectAll('.reverser-span')
      .html(l10n.tHtml('inspector.check.reverser'))
      .call(uiIcon(icon, 'inline'));

    return selection;
  }


  let check = function(selection) {
    checkImpliedYes();

    label = selection.selectAll('.form-field-input-wrap')
      .data([0]);

    let enter = label.enter()
      .append('label')
      .attr('class', 'form-field-input-wrap form-field-input-check');

    enter
      .append('input')
      .property('indeterminate', uifield.type !== 'defaultCheck')
      .attr('type', 'checkbox')
      .attr('id', uifield.uid);

    enter
      .append('span')
      .html(texts[0])
      .attr('class', 'value');

    if (uifield.type === 'onewayCheck') {
      enter
        .append('button')
        .attr('class', 'reverser' + (reverserHidden() ? ' hide' : ''))
        .append('span')
        .attr('class', 'reverser-span');
    }

    label = label.merge(enter);
    input = label.selectAll('input');
    text = label.selectAll('span.value');

    input
      .on('click', function(d3_event) {
        d3_event.stopPropagation();
        const key = uifield.key;
        let tagChange = {};

        if (Array.isArray(_tags[key])) {
          if (values.indexOf('yes') !== -1) {
            tagChange[key] = 'yes';
          } else {
            tagChange[key] = values[0];
          }
        } else {
          tagChange[key] = values[(values.indexOf(_value) + 1) % values.length];
        }

        // Don't cycle through `alternating` or `reversible` states - iD#4970
        // (They are supported as translated strings, but should not toggle with clicks)
        if (tagChange[key] === 'reversible' || tagChange[key] === 'alternating') {
          tagChange[key] = values[0];
        }

        dispatch.call('change', this, tagChange);
      });


    if (uifield.type === 'onewayCheck') {
      reverser = label.selectAll('.reverser');

      reverser
        .call(reverserSetText)
        .on('click', function(d3_event) {
          d3_event.preventDefault();
          d3_event.stopPropagation();
          if (!_entityIDs.length) return;

          const combinedAction = (graph) => {
            for (const entityID of _entityIDs) {
              graph = actionReverse(entityID)(graph);
            }
            return graph;
          };

          editor.perform(combinedAction);
          editor.commit({
            annotation: l10n.t('operations.reverse.annotation.line', { n: 1 }),
            selectedIDs: _entityIDs
          });

          d3_select(this)
            .call(reverserSetText);
        });
    }
  };


  check.entityIDs = function(val) {
    if (!arguments.length) return _entityIDs;
    _entityIDs = val;
    return check;
  };


  check.tags = function(tags) {
    _tags = tags;
    const key = uifield.key;

    function isChecked(val) {
      return val !== 'no' && val !== '' && val !== undefined && val !== null;
    }

    function textFor(val) {
      if (val === '') val = undefined;
      const index = values.indexOf(val);
      return index === -1 ? `"${val}"` : texts[index];
    }

    checkImpliedYes();
    let isMixed = Array.isArray(tags[key]);
    _value = !isMixed && tags[key] && tags[key].toLowerCase();

    if (uifield.type === 'onewayCheck' && (_value === '1' || _value === '-1')) {
      _value = 'yes';
    }

    input
      .property('indeterminate', isMixed || (uifield.type !== 'defaultCheck' && !_value))
      .property('checked', isChecked(_value));

    text
      .html(isMixed ? l10n.tHtml('inspector.multiple_values') : textFor(_value))
      .classed('mixed', isMixed);

    label
      .classed('set', !!_value);

    if (uifield.type === 'onewayCheck') {
      reverser
        .classed('hide', reverserHidden())
        .call(reverserSetText);
    }
  };


  check.focus = function() {
    input.node().focus();
  };

  return utilRebind(check, dispatch, 'on');
}
