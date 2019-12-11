import {
    event as d3_event,
    select as d3_select
} from 'd3-selection';

import marked from 'marked';
import { svgIcon } from '../svg/icon';
import { uiCmd } from './cmd';
import { uiIntro } from './intro/intro';
import { uiShortcuts } from './shortcuts';
import { uiTooltipHtml } from './tooltipHtml';

import { t, textDirection } from '../util/locale';
import { tooltip } from '../util/tooltip';
import { icon } from './intro/helper';

export function uiSnowflakes(context) {
    
    function hidePane() {
        context.ui().togglePanes();
    }

    uiSnowflakes.togglePane = function() {
        if (d3_event) d3_event.preventDefault();
        paneTooltip.hide();
        context.ui().togglePanes(!_pane.classed('shown') ? _pane : undefined);
    };

    uiSnowflakes.renderToggleButton = function(selection) {

        selection.append('button')
            .on('click', uiHelp.togglePane)
            .call(svgIcon('#iD-icon-help', 'light'))
            .call(paneTooltip);
    };


    uiSnowflakes.renderPane = function(selection) {

        _pane = selection.append('div')
            .attr('class', 'snowflake-wrap fillL')
            .attr('pane', 'snowflakes');


    var snowflakeSlowDiv = _pane
        .append('div')
        .attr('id', 'snowflakes-slow')
        .attr('aria-hidden', 'true')
        .attr('class', 'pane-heading hide');

        for (var i=0; i < 18; i++)
        {
            snowflakeSlowDiv
            .append('div')
            .attr('class', 'snowflake slow ')
            .text('❅');
        }

        var snowflakeDiv = _pane
            .append('div')
            .attr('id', 'snowflakes')
            .attr('aria-hidden', 'true')
            .attr('class', 'pane-heading hide');

        for (var i=0; i < 12; i++)
        {
            snowflakeDiv
            .append('div')
            .attr('class', 'snowflake')
            .text('❅');

        }

        var snowflakeFastDiv = _pane
            .append('div')
            .attr('id', 'snowflakes-fast')
            .attr('aria-hidden', 'true')
            .attr('class', 'pane-heading hide');

        for (var i=0; i < 12; i++)
        {
            snowflakeFastDiv
            .append('div')
            .attr('class', 'snowflake fast')
            .text('❅');

        }
    };

    return uiSnowflakes;
}
