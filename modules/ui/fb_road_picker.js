import { t } from '../util/locale';

import { actionNoop, actionStitchFbRoad } from '../actions';
import { modeBrowse, modeSelect } from '../modes';
import { serviceFbMLRoads } from '../services';
import { svgIcon } from '../svg';
import { tooltip } from '../util/tooltip';
import { uiTooltipHtml } from './tooltipHtml';


export function uiFbRoadPicker(context, keybinding) {
    var _datum;


    function onAcceptRoad() {
        if (_datum) {
            var annotation = t('fb_road_picker.option_accept.annotation');
            context.perform(actionStitchFbRoad(_datum.id, serviceFbMLRoads.graph()), annotation);
            context.enter(modeSelect(context, [_datum.id]));
        }
    }


    function onRejectRoad() {
        context.perform(actionNoop());   // trigger redraw
        context.enter(modeBrowse(context));
    }


    function presetItem(selection, p) {
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
            .attr('class', 'preset-list-button')
            .on('click', p.onClick);

        if (p.tooltip) {
            presetButton = presetButton.call(p.tooltip);
        }

        presetButton
            .append('div')
            .attr('class', 'preset-icon-container medium')
            .append('svg')
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


    function fbRoadPicker(selection) {
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
            .attr('class', 'header fillL');

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
            .attr('class', 'body fillL');

        bodyEnter
            .append('h4')
            .text(t('fb_road_picker.prompt'));

        presetItem(bodyEnter, {
            iconName: '#iD-icon-rapid-plus-circle',
            label: t('fb_road_picker.option_accept.label'),
            description: t('fb_road_picker.option_accept.description'),
            tooltip: tooltip()
                .placement('bottom')
                .html(true)
                .title(uiTooltipHtml(
                    t('fb_road_picker.option_accept.tooltip'),
                    t('fb_road_picker.option_accept.key'))),
            onClick: onAcceptRoad
        });

        presetItem(bodyEnter, {
            iconName: '#iD-icon-rapid-minus-circle',
            label: t('fb_road_picker.option_reject.label'),
            description: t('fb_road_picker.option_reject.description'),
            tooltip: tooltip()
                .placement('bottom')
                .html(true)
                .title(uiTooltipHtml(
                    t('fb_road_picker.option_reject.tooltip'),
                    t('fb_road_picker.option_reject.key'))),
            onClick: onRejectRoad
        });

        // Update body
        body = body
            .merge(bodyEnter);
    }


    fbRoadPicker.datum = function(val) {
        if (!arguments.length) return _datum;
        _datum = val;
        return this;
    };


    keybinding
        .on(t('fb_road_picker.option_accept.key'), onAcceptRoad)
        .on(t('fb_road_picker.option_reject.key'), onRejectRoad);

    return fbRoadPicker;
}
