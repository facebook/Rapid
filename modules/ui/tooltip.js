import { select as d3_select } from 'd3-selection';

import { utilFunctor } from '../util/util';
import { uiPopover } from './popover';
import { uiCmd } from './cmd';


export function uiTooltip(context) {
    const l10n = context.systems.l10n;
    var tooltip = uiPopover(context, 'tooltip').displayType('hover');

    var _title = function() {
        var title = this.getAttribute('data-original-title');
        if (title) {
            return title;
        } else {
            title = this.getAttribute('title');
            this.removeAttribute('title');
            this.setAttribute('data-original-title', title);
        }
        return title;
    };

    var _heading = utilFunctor(null);
    var _keys = utilFunctor(null);

    tooltip.title = function(val) {
        if (!arguments.length) return _title;
        _title = utilFunctor(val);
        return tooltip;
    };

    tooltip.heading = function(val) {
        if (!arguments.length) return _heading;
        _heading = utilFunctor(val);
        return tooltip;
    };

    tooltip.keys = function(val) {
        if (!arguments.length) return _keys;
        _keys = utilFunctor(val);
        return tooltip;
    };

    tooltip.content(function() {
        var heading = _heading.apply(this, arguments);
        var text = _title.apply(this, arguments);
        var keys = _keys.apply(this, arguments);

        return function(selection) {
            var headingSelect = selection
                .selectAll('.tooltip-heading')
                .data(heading ? [heading] :[]);

            headingSelect.exit()
                .remove();

            headingSelect.enter()
                .append('div')
                .attr('class', 'tooltip-heading')
                .merge(headingSelect)
                .text(heading);

            var textSelect = selection
                .selectAll('.tooltip-text')
                .data(text ? [text] :[]);

            textSelect.exit()
                .remove();

            textSelect.enter()
                .append('div')
                .attr('class', 'tooltip-text')
                .merge(textSelect)
                .html(text);    // watch out: a few tooltips still send html through here

            var keyhintWrap = selection
                .selectAll('.tooltip-keyhint')
                .data(keys?.length ? [0] : []);

            keyhintWrap.exit()
                .remove();

            var keyhintWrapEnter = keyhintWrap.enter()
                .append('div')
                .attr('class', 'tooltip-keyhint');

            keyhintWrapEnter
                .append('span')
                .text(l10n.t('tooltip_keyhint'));  // "Shortcut:"

            keyhintWrap = keyhintWrapEnter.merge(keyhintWrap);

            keyhintWrap.selectAll('kbd.shortcut')
                .data(keys?.length ? keys : [])
                .enter()
                .each((d, i, nodes) => {
                    const selection = d3_select(nodes[i]);

                    selection
                        .append('kbd')
                        .attr('class', 'shortcut')
                        .text(d => uiCmd.display(context, d));

                    if (i < keys.length - 1) {
                        selection
                            .append('span')
                            .text('+');
                    }
                });
        };
    });

    return tooltip;
}
