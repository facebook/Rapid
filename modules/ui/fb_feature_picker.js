import { t } from '../util/locale';

import { actionNoop, actionStitchFbRoad } from '../actions';
import { modeBrowse, modeSelect } from '../modes';
import { serviceFbAIFeatures } from '../services';
import { svgIcon } from '../svg';
import { tooltip } from '../util/tooltip';
import { uiFlash } from './flash';
import { uiTooltipHtml } from './tooltipHtml';
import { utilStringQs } from '../util';
import { uiRapidFirstEdit } from './rapid_first_edit_dialog';


export function uiFbFeaturePicker(context, keybinding) {
    var _datum;
    var AI_FEATURES_LIMIT_NON_TM_MODE = 50;


    function isAddFeatureDisabled() {
        // when task GPX is set in URL (TM mode), "add roads" is always enabled
        var gpxInUrl = utilStringQs(window.location.hash).gpx;
        if (gpxInUrl) return false;

        var annotations = context.history().peekAllAnnotations(); 
        var aiFeatureAccepts = annotations.filter(function (a) { return a.type === 'fb_accept_feature'; });        
        return aiFeatureAccepts.length >= AI_FEATURES_LIMIT_NON_TM_MODE;
    }


    function onAcceptRoad() {
        if (_datum) {
            if (isAddFeatureDisabled()) {
                var flash = uiFlash()
                    .duration(4000)
                    .iconName('#iD-icon-rapid-plus-circle')
                    .iconClass('operation disabled')
                    .text(t(
                        'fb_feature_picker.option_accept.disabled_flash',
                        {n: AI_FEATURES_LIMIT_NON_TM_MODE}
                    ));
                flash();
                return;
            }

            // In place of a string annotation, this introduces an "object-style"
            // annotation, where "type" and "description" are standard keys,
            // and there may be additional properties. Note that this will be
            // serialized to JSON while saving undo/redo state in history.save().
            var annotation = {
                type: 'fb_accept_feature',
                description: t('fb_feature_picker.option_accept.annotation'),
                id: _datum.id,
                origid: _datum.__origid__,
            };
            context.perform(actionStitchFbRoad(_datum.id, serviceFbAIFeatures.graph()), annotation);
            context.enter(modeSelect(context, [_datum.id]));

            if (context.inIntro()) return;

            if (sessionStorage.getItem('acknowledgedLogin') === 'true') return;
            sessionStorage.setItem('acknowledgedLogin', 'true');
            var osm = context.connection();

            if (!osm.authenticated()) {
                context.container()
                    .call(uiRapidFirstEdit(context));
            }
        }
    }


    function onRejectRoad() {
        if (_datum) {
            var annotation = {
                type: 'fb_reject_feature',
                description: t('fb_feature_picker.option_reject.annotation'),
                id: _datum.id,
                origid: _datum.__origid__,
            };
            context.perform(actionNoop(), annotation);
            context.enter(modeBrowse(context));
        }
    }


    function presetItem(selection, p, presetButtonClasses) {
        var presetItem = selection
            .append('div')
            .attr('class', 'preset-list-item');

        var presetWrap = presetItem
            .append('div')
            .attr('class', 'preset-list-button-wrap');

        var presetReference = presetItem
            .append('div')
            .attr('class', 'tag-reference-body');

        presetReference
            .text(p.description);

        var presetButton = presetWrap
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
            .on('click', function() {
                presetReference
                    .classed('shown', !presetReference.classed('shown'));
            })
            .call(svgIcon('#iD-icon-inspect'));
    }


    function fbFeaturePicker(selection) {
        var wrap = selection.selectAll('.fb-road-picker')
            .data([0]);

        wrap = wrap.enter()
            .append('div')
            .attr('class', 'fb-road-picker')
            .merge(wrap);

        // Header
        var header = wrap.selectAll('.header')
            .data([0]);

        var headerEnter = header.enter()
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
            .attr('class', 'fr fb-road-picker-close')
            .on('click', function() {
                context.enter(modeBrowse(context));
            })
            .call(svgIcon('#iD-icon-close'));

        // Update header
        header = header
            .merge(headerEnter);


        // Body
        var body = wrap.selectAll('.body')
            .data([0]);

        var bodyEnter = body.enter()
            .append('div')
            .attr('class', 'body control-col');

        bodyEnter
            .append('h4')
            .text(t('fb_feature_picker.prompt'));

        presetItem(bodyEnter, {
            iconName: '#iD-icon-rapid-plus-circle',
            label: t('fb_feature_picker.option_accept.label'),
            description: t('fb_feature_picker.option_accept.description'),
            tooltip: tooltip()
                .placement('bottom')
                .html(true)
                .title(function() {
                    return isAddFeatureDisabled()
                        ? uiTooltipHtml(t(
                              'fb_feature_picker.option_accept.disabled',
                              {n: AI_FEATURES_LIMIT_NON_TM_MODE}
                          ))
                        : uiTooltipHtml(
                              t('fb_feature_picker.option_accept.tooltip'),
                              t('fb_feature_picker.option_accept.key')
                          );
                }),
            onClick: onAcceptRoad,
            disabledFunction: isAddFeatureDisabled
        }, 'ai-features-accept');

        presetItem(bodyEnter, {
            iconName: '#iD-icon-rapid-minus-circle',
            label: t('fb_feature_picker.option_reject.label'),
            description: t('fb_feature_picker.option_reject.description'),
            tooltip: tooltip()
                .placement('bottom')
                .html(true)
                .title(uiTooltipHtml(
                    t('fb_feature_picker.option_reject.tooltip'),
                    t('fb_feature_picker.option_reject.key'))),
            onClick: onRejectRoad
        }, 'ai-features-reject');

        // Update body
        body = body
            .merge(bodyEnter);
    }


    fbFeaturePicker.datum = function(val) {
        if (!arguments.length) return _datum;
        _datum = val;
        return this;
    };


    keybinding()
        .on(t('fb_feature_picker.option_accept.key'), onAcceptRoad)
        .on(t('fb_feature_picker.option_reject.key'), onRejectRoad);

    return fbFeaturePicker;
}
