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
    const aiFeatureAccepts = annotations.filter(a => a.type === 'fb_accept_feature');
    return aiFeatureAccepts.length >= AI_FEATURES_LIMIT_NON_TM_MODE;
  }


  function onAcceptFeature() {
    if (!_datum) return;

    if (isAddFeatureDisabled()) {
      const flash = uiFlash()
        .duration(4000)
        .iconName('#iD-icon-rapid-plus-circle')
        .iconClass('operation disabled')
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


  function presetItem(selection, p, presetButtonClasses, reject) {
    let presetItem = selection
      .append('div')
      .attr('class',  reject ? 'preset-list-item reject' : 'preset-list-item');

    let presetWrap = presetItem
      .append('div')
      .attr('class', 'preset-list-button-wrap');

    let presetReference = presetItem
      .append('div')
      .attr('class', 'tag-reference-body');

    presetReference
      .text(p.description);

    let presetButton = presetWrap
      .append('button')
      .attr('class', 'picker-list-button ' + presetButtonClasses)
      .on('click', p.onClick);

    if (p.disabledFunction) {
      presetButton = presetButton.classed('disabled', p.disabledFunction);
    }

    if (p.tooltip) {
      presetButton = presetButton.call(p.tooltip);
    }

    presetButton
      .append('div')
      .attr('class', 'picker-icon-container medium')
      .append('svg')
      .attr('class', 'icon')
      .append('use')
      .attr('xlink:href', p.iconName);

    presetButton
      .append('div')
      .attr('class', 'label')
      .append('div')
      .attr('class', 'label-inner')
      .append('div')
      .attr('class', 'namepart')
      .text(p.label);

    presetWrap
      .append('button')
      .attr('class', 'tag-reference-button')
      .attr('title', 'info')
      .attr('tabindex', '-1')
      .on('click', () => presetReference.classed('shown', !presetReference.classed('shown')) )
      .call(svgIcon('#iD-icon-inspect'));
  }


  function previewTags(selection, tagsObj) {

    if (!tagsObj) return;

    let tagPreview = selection
      .append('div');

    tagPreview
      .attr('class', 'tag-preview');

    var tagEntries= [];
    Object.keys(tagsObj).forEach(k => { tagEntries.push({'key':k, 'value':tagsObj[k]});});

    var tagBag = tagPreview
      .append('div')
      .attr('class', 'tag-bag');

    tagBag
      .append('div')
      .attr('class', 'tag-heading')
      .text(t('rapid_feature_inspector.tags.title'));


    tagEntries.forEach(e => {

      let entryDiv = tagBag.append('div')
        .attr('class', 'tag-entry');

      entryDiv.append('div').attr('class', 'tag-key').text(e.key);
      entryDiv.append('div').attr('class', 'tag-value').text(e.value);
    });




    // var listContainer = tagBag
    //   .data(tagEntries)
    //   .enter();

    // var entry  = listContainer.append('div')
    //   .attr('class', 'tag-entry');

    // entry
    //   .append('div')
    //   .attr('class', 'tag-key')
    //   .text(d => d.key);

    // entry
    //   .append('div')
    //   .attr('class', 'tag-value')
    //   .text(d => d.value);
  }


  function rapidInspector(selection) {
    let wrap = selection.selectAll('.rapid-inspector')
      .data([0]);

    wrap = wrap.enter()
      .append('div')
      .attr('class', 'rapid-inspector')
      .merge(wrap);

    // Header
    let header = wrap.selectAll('.header')
      .data([0]);

    let headerEnter = header.enter()
      .append('div')
      .attr('class', 'header control-col');

    headerEnter
      .append('h3')
      .append('svg')
      .attr('class', 'logo-rapid')
      .append('use')
      .attr('xlink:href', '#iD-logo-rapid');

    headerEnter
      .append('button')
      .attr('class', 'fr rapid-inspector-close')
      .on('click', () => context.enter(modeBrowse(context)) )
      .call(svgIcon('#iD-icon-close'));

    // Update header
    header = header
      .merge(headerEnter);


    // Body
    let body = wrap.selectAll('.body')
      .data([0]);

    let bodyEnter = body.enter()
      .append('div')
      .attr('class', 'body control-col');

    bodyEnter
      .append('h4')
      .text(t('rapid_feature_inspector.prompt'));

    presetItem(bodyEnter, {
      iconName: '#iD-icon-rapid-plus-circle',
      label: t('rapid_feature_inspector.option_accept.label'),
      description: t('rapid_feature_inspector.option_accept.description'),
      tooltip: uiTooltip()
        .placement('bottom')
        .title(() => {
          return isAddFeatureDisabled()
            ? uiTooltip()
                .title(t('rapid_feature_inspector.option_accept.disabled', { n: AI_FEATURES_LIMIT_NON_TM_MODE } ))
            : uiTooltip()
                .title(t('rapid_feature_inspector.option_accept.tooltip'))
                .keys([t('rapid_feature_inspector.option_accept.key')]);
        }),
      onClick: onAcceptFeature,
      disabledFunction: isAddFeatureDisabled
    }, 'ai-features-accept', false);

    previewTags(bodyEnter, _datum.tags);

    presetItem(bodyEnter, {
      iconName: '#iD-icon-rapid-minus-circle',
      label: t('rapid_feature_inspector.option_reject.label'),
      description: t('rapid_feature_inspector.option_reject.description'),
      tooltip: uiTooltip()
        .placement('bottom')
        .title(t('rapid_feature_inspector.option_reject.tooltip'))
        .keys([t('rapid_feature_inspector.option_reject.key')]),
      onClick: onRejectFeature
    }, 'ai-features-reject', true);


    // Update body
    body = body
      .merge(bodyEnter);
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
