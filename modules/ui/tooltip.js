import { select as d3_select } from 'd3-selection';

import { uiPopover } from './popover.js';
import { uiCmd } from './cmd.js';
import { utilFunctor } from '../util/util.js';


export function uiTooltip(context) {
  const l10n = context.systems.l10n;
  const tooltip = uiPopover(context, 'tooltip').displayType('hover');

  let _title = utilFunctor(null);
  let _heading = utilFunctor(null);
  let _shortcut = utilFunctor(null);


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

  tooltip.shortcut = function(val) {
    if (!arguments.length) return _shortcut;
    _shortcut = utilFunctor(val);
    return tooltip;
  };


  tooltip.content(function() {
    const heading = _heading.apply(this, arguments);
    const text = _title.apply(this, arguments);
    const shortcut = _shortcut.apply(this, arguments);

    return function(selection) {
      const headingWrap = selection
        .selectAll('.tooltip-heading')
        .data(heading ? [heading] : []);

      headingWrap.exit()
        .remove();

      headingWrap.enter()
        .append('div')
        .attr('class', 'tooltip-heading')
        .merge(headingWrap)
        .text(d => d);

      const textWrap = selection
        .selectAll('.tooltip-text')
        .data(text ? [text] : []);

      textWrap.exit()
        .remove();

      textWrap.enter()
        .append('div')
        .attr('class', 'tooltip-text')
        .merge(textWrap)
        .html(d => d);    // watch out: a few tooltips still send html through here

      const shortcutWrap = selection
        .selectAll('.tooltip-keyhint')
        .data(shortcut ? [shortcut] : []);

      shortcutWrap.exit()
        .remove();

      const shortcutWrapEnter = shortcutWrap.enter()
        .append('div')
        .attr('class', 'tooltip-keyhint')
        .text(d => d.length === 1 ? l10n.t('tooltip_keyhint') : null);  // "Key:"

      const shortcutKeysEnter = shortcutWrapEnter
        .append('span')
        .attr('class', 'tooltip-keys');

      // Split the shortcut string into an array and display a `kbd` for each one
      // Warning: this will fail if the key is multiple character like 'F11'
      // (we aren't displaying this in a tooltip currently)
      shortcutKeysEnter.selectAll('kbd.shortcut')
        .data(d => (typeof d === 'string') ? d.split('') : [])
        .enter()
        .each((d, i, nodes) => {
          const selection = d3_select(nodes[i]);

          selection
            .append('kbd')
            .attr('class', 'shortcut')
            .text(d => uiCmd.display(context, d));

          if (i < shortcut.length - 1) {
            selection
              .append('span')
              .text('+');
          }
        });
    };
  });

  return tooltip;
}
