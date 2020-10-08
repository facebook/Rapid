import { select as d3_select } from 'd3-selection';
import { t } from '../core/localizer';

import { actionNoop, actionRapidAcceptFeature } from '../actions';
import { modeBrowse, modeSelect } from '../modes';
import { services } from '../services';
import { svgIcon } from '../svg';
import { uiFlash } from './flash';
import { uiTooltip } from './tooltip';
import { utilStringQs } from '../util';
import { uiRapidFirstEditDialog } from './rapid_first_edit_dialog';


export function uiRapidFeatureInspector(context, keybinding) {
  const AI_FEATURES_LIMIT_NON_TM_MODE = 50;
  let _datum;


  function isAddFeatureDisabled() {
    // when task GPX is set in URL (TM mode), "add roads" is always enabled
    const gpxInUrl = utilStringQs(window.location.hash).gpx;
    if (gpxInUrl) return false;

    const annotations = context.history().peekAllAnnotations();
    const aiFeatureAccepts = annotations.filter(a => a.type === 'rapid_accept_feature');
    return aiFeatureAccepts.length >= AI_FEATURES_LIMIT_NON_TM_MODE;
  }


  function onAcceptFeature() {
    if (!_datum) return;

    if (isAddFeatureDisabled()) {
      const flash = uiFlash(context)
        .duration(5000)
        .text(t(
          'rapid_feature_inspector.option_accept.disabled_flash',
          { n: AI_FEATURES_LIMIT_NON_TM_MODE }
        ));
      flash();
      return;
    }

    // In place of a string annotation, this introduces an "object-style"
    // annotation, where "type" and "description" are standard keys,
    // and there may be additional properties. Note that this will be
    // serialized to JSON while saving undo/redo state in history.save().
    const annotation = {
      type: 'rapid_accept_feature',
      description: t('rapid_feature_inspector.option_accept.annotation'),
      id: _datum.id,
      origid: _datum.__origid__,
    };

    const service = _datum.__service__ === 'esri' ? services.esriData : services.fbMLRoads;
    const graph = service.graph(_datum.__datasetid__);
    context.perform(actionRapidAcceptFeature(_datum.id, graph), annotation);
    context.enter(modeSelect(context, [_datum.id]));

    if (context.inIntro()) return;

    // remember sources for later when we prepare the changeset
    const rapidContext = context.rapidContext();
    const source = _datum.tags && _datum.tags.source;
    if (source) {
      rapidContext.sources.add(source);
    }

    if (sessionStorage.getItem('acknowledgedLogin') === 'true') return;
    sessionStorage.setItem('acknowledgedLogin', 'true');

    const osm = context.connection();
    if (!osm.authenticated()) {
      context.container()
        .call(uiRapidFirstEditDialog(context));
    }
  }


  function onRejectFeature() {
    if (!_datum) return;

    const annotation = {
      type: 'rapid_ignore_feature',
      description: t('rapid_feature_inspector.option_reject.annotation'),
      id: _datum.id,
      origid: _datum.__origid__
    };
    context.perform(actionNoop(), annotation);
    context.enter(modeBrowse(context));
  }


  function previewTags(selection) {
    const tags = _datum && _datum.tags;
    if (!tags) return;

    let tagPreview = selection
      .append('div')
      .attr('class', 'tag-preview');

    let tagBag = tagPreview
      .append('div')
      .attr('class', 'tag-bag');

    tagBag
      .append('div')
      .attr('class', 'tag-heading')
      .text(t('rapid_feature_inspector.tags'));

    const tagEntries = Object.keys(tags).map(k => ({ key: k, value: tags[k] }) );

    tagEntries.forEach(e => {
      let entryDiv = tagBag.append('div')
        .attr('class', 'tag-entry');

      entryDiv.append('div').attr('class', 'tag-key').text(e.key);
      entryDiv.append('div').attr('class', 'tag-value').text(e.value);
    });
  }


  function rapidInspector(selection) {
    let inspectorEnter = selection.selectAll('.rapid-inspector')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'rapid-inspector');

    // Header
    let headerEnter = inspectorEnter
      .append('div')
      .attr('class', 'header');

    headerEnter
      .append('h3')
      .append('svg')
      .attr('class', 'logo-rapid dark')
      .append('use')
      .attr('xlink:href', '#iD-logo-rapid');

    headerEnter
      .append('button')
      .attr('class', 'fr rapid-inspector-close')
      .on('click', (d, i, nodes) => {
        d3_select(nodes[i]).node().blur();
        context.enter(modeBrowse(context));
      })
      .call(svgIcon('#iD-icon-close'));


    // Body
    let bodyEnter = inspectorEnter
      .append('div')
      .attr('class', 'body');

    bodyEnter
      .call(previewTags);

    bodyEnter
      .append('p')
      .text(t('rapid_feature_inspector.prompt'));

    const choices = [
      {
        key: 'accept',
        iconName: '#iD-icon-rapid-plus-circle',
        label: t('rapid_feature_inspector.option_accept.label'),
        description: t('rapid_feature_inspector.option_accept.description'),
        onClick: onAcceptFeature
      }, {
        key: 'ignore',
        iconName: '#iD-icon-rapid-minus-circle',
        label: t('rapid_feature_inspector.option_reject.label'),
        description: t('rapid_feature_inspector.option_reject.description'),
        onClick: onRejectFeature
      }
    ];

    let choicesEnter = bodyEnter
      .append('div')
      .attr('class', 'rapid-inspector-choices');

    let choiceEnter = choicesEnter.selectAll('.rapid-inspector-choice')
      .data(choices, d => d.key)
      .enter()
      .append('div')
      .attr('class', d => `rapid-inspector-choice rapid-inspector-choice-${d.key}`)
      .each(showChoice);
  }


  function showChoice(d, i, nodes) {
    let selection = d3_select(nodes[i]);
    const disableClass = (d.key === 'accept' && isAddFeatureDisabled()) ? 'secondary disabled': '';

    let choiceWrap = selection
      .append('div')
      .attr('class', `choice-wrap choice-wrap-${d.key}`);

    let choiceReference = selection
      .append('div')
      .attr('class', 'tag-reference-body');

    choiceReference
      .text(d.description);

    const onClick = d.onClick;
    let choiceButton = choiceWrap
      .append('button')
      .attr('class', `choice-button choice-button-${d.key} ${disableClass}`)
      .on('click', (d, i, nodes) => {
        d3_select(nodes[i]).node().blur();
        onClick();
      });

    let tooltip;
    if (d.key === 'accept') {
      tooltip = uiTooltip()
        .placement('bottom')
        .title(() => {
          return isAddFeatureDisabled()
            ? uiTooltip()
                .title(t('rapid_feature_inspector.option_accept.disabled', { n: AI_FEATURES_LIMIT_NON_TM_MODE } ))
            : uiTooltip()
                .title(t('rapid_feature_inspector.option_accept.tooltip'))
                .keys([t('rapid_feature_inspector.option_accept.key')]);
        });
    } else if (d.key === 'ignore') {
      tooltip = uiTooltip()
        .placement('bottom')
        .title(t('rapid_feature_inspector.option_reject.tooltip'))
        .keys([t('rapid_feature_inspector.option_reject.key')]);
    }

// something off about the tooltips
    // if (tooltip) {
      // choiceButton = choiceButton.call(tooltip);
    // }

    choiceButton
      .append('svg')
      .attr('class', 'choice-icon icon')
      .append('use')
      .attr('xlink:href', d.iconName);

    choiceButton
      .append('div')
      .attr('class', 'choice-label')
      .text(d.label);

    choiceWrap
      .append('button')
      .attr('class', `tag-reference-button ${disableClass}`)
      .attr('title', 'info')
      .attr('tabindex', '-1')
      .on('click', (d, i, nodes) => {
        d3_select(nodes[i]).node().blur();
        choiceReference.classed('expanded', !choiceReference.classed('expanded'));
      })
      .call(svgIcon('#iD-icon-inspect'));
  }


  rapidInspector.datum = function(val) {
    if (!arguments.length) return _datum;
    _datum = val;
    return this;
  };


  keybinding()
    .on(t('rapid_feature_inspector.option_accept.key'), onAcceptFeature)
    .on(t('rapid_feature_inspector.option_reject.key'), onRejectFeature);

  return rapidInspector;
}
