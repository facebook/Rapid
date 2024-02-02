import { dispatch as d3_dispatch } from 'd3-dispatch';
import { utilArrayIdentical } from '@rapid-sdk/util';

import { uiTooltip } from '../tooltip.js';
import { utilRebind } from '../../util/index.js';
import { uiPresetIcon } from '../preset_icon.js';
import { uiSection } from '../section.js';
import { uiTagReference } from '../tag_reference.js';


export function uiSectionFeatureType(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const dispatch = d3_dispatch('choose');

  let _entityIDs = [];
  let _presets = [];
  let _tagReference;

  let section = uiSection(context, 'feature-type')
    .label(l10n.t('inspector.feature_type'))
    .disclosureContent(renderDisclosureContent);


  function renderDisclosureContent(selection) {
    selection.classed('preset-list-item', true);
    selection.classed('mixed-types', _presets.length > 1);

    let presetButtonWrap = selection
      .selectAll('.preset-list-button-wrap')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'preset-list-button-wrap');

    let presetButton = presetButtonWrap
      .append('button')
      .attr('class', 'preset-list-button preset-reset')
      .call(uiTooltip(context)
        .title(l10n.t('inspector.back_tooltip'))
        .placement('bottom')
      );

    presetButton.append('div')
      .attr('class', 'preset-icon-container');

    presetButton
      .append('div')
      .attr('class', 'label')
      .append('div')
      .attr('class', 'label-inner');

    presetButtonWrap.append('div')
      .attr('class', 'accessory-buttons');

    let tagReferenceBodyWrap = selection
      .selectAll('.tag-reference-body-wrap')
      .data([0]);

    tagReferenceBodyWrap = tagReferenceBodyWrap
      .enter()
      .append('div')
      .attr('class', 'tag-reference-body-wrap')
      .merge(tagReferenceBodyWrap);

    // update header
    if (_tagReference) {
      selection.selectAll('.preset-list-button-wrap .accessory-buttons')
        .style('display', _presets.length === 1 ? null : 'none')
        .call(_tagReference.button);

      tagReferenceBodyWrap
        .style('display', _presets.length === 1 ? null : 'none')
        .call(_tagReference.body);
    }

    selection.selectAll('.preset-reset')
      .on('click', function() {
         dispatch.call('choose', this, _presets);
      })
      .on('pointerdown pointerup mousedown mouseup', function(d3_event) {
        d3_event.preventDefault();
        d3_event.stopPropagation();
      });

    let geometries = entityGeometries();
    selection.select('.preset-list-item button')
      .call(uiPresetIcon(context)
        .geometry(_presets.length === 1 ? (geometries.length === 1 && geometries[0]) : null)
        .preset(_presets.length === 1 ? _presets[0] : context.systems.presets.item('point'))
      );

    let names = _presets.length === 1 ? [
      _presets[0].nameLabel(),
      _presets[0].subtitleLabel()
    ].filter(Boolean) : [l10n.t('inspector.multiple_types')];

    let label = selection.select('.label-inner');
    let nameparts = label.selectAll('.namepart')
      .data(names, d => d);

    nameparts.exit()
      .remove();

    nameparts
      .enter()
      .append('div')
      .attr('class', 'namepart')
      .html(d => d);
  }

  section.entityIDs = function(val) {
    if (!arguments.length) return _entityIDs;
    _entityIDs = val;
    return section;
  };

  section.presets = function(val) {
    if (!arguments.length) return _presets;

    // don't reload the same preset
    if (!utilArrayIdentical(val, _presets)) {
      _presets = val;

      if (_presets.length === 1) {
        _tagReference = uiTagReference(context, _presets[0].reference()).showing(false);
      }
    }

    return section;
  };


  function entityGeometries() {
    let counts = {};

    const graph = editor.staging.graph;
    for (const entityID of _entityIDs) {
      const geometry = graph.geometry(entityID);
      if (!counts[geometry]) counts[geometry] = 0;
      counts[geometry] += 1;
    }

    return Object.keys(counts)
      .sort((geom1, geom2) => counts[geom2] - counts[geom1]);
  }

  return utilRebind(section, dispatch, 'on');
}
