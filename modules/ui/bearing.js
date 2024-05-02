import { vecRotate } from '@rapid-sdk/math';

import { uiIcon } from './icon.js';
import { uiTooltip } from './tooltip.js';


export function uiBearing(context) {
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const viewport = context.viewport;

  const tooltip = uiTooltip(context);
  let _selection;

  // reset event handler
  map.off('draw', render);
  map.on('draw', render);


  return function(selection) {
    _selection = selection;
    render();
  };


  function render() {
    if (!_selection) return;  // called too early

    let button = _selection.selectAll('button.bearing')
      .data([0]);

    // enter
    const buttonEnter = button.enter()
      .append('button')
      .attr('class', 'bearing')
      .on('click', e => {
        e.preventDefault();
        const t = viewport.transform.props;
        if (t.r !== 0) {
          map.transformEase(Object.assign(t, { r: 0 }));
        }
      });

    buttonEnter
      .append('div')
      .attr('class', 'bearing_n')
      .text(l10n.t('bearing.n'));  // the letter 'N'

    buttonEnter.call(tooltip
      .placement(l10n.isRTL() ? 'right' : 'left')
      .title(l10n.t('bearing.reset_bearing'))
      .shortcut('⇧ ')  // hack, we will replace the space with the arrow keys icon
    );

    buttonEnter
      .call(uiIcon('#rapid-icon-compass', 'light'));


    // update
    button = button.merge(buttonEnter);

    // Insert a better keyhint
    button.selectAll('.tooltip-keyhint')
      .selectAll('.rotate-the-map')
      .data([0])
      .enter()
      .insert('div', '.tooltip-keys')
      .attr('class', 'rotate-the-map')
      .text(l10n.t('bearing.rotate_the_map'));

    button.selectAll('.tooltip-keys > kbd.shortcut:last-of-type')
      .classed('hide', true);  // remove the space

    button.selectAll('.tooltip-keys')
      .call(uiIcon('#rapid-interaction-keyboard-arrows-left-right', 'operation'));


    const rot = viewport.transform.rotation;
    const isNorthUp = (rot === 0);

    // Translate the 'N' around opposite of the compass pointer
    const npos = vecRotate([0, 8], rot, [0, 0]);
    button.selectAll('.bearing_n')
      .style('transform', `translate(${npos[0]}px, ${npos[1]}px)`);

    // Select direct descendant compass icon only (not the tooltip-keys icon!)...
    // Because `d3.selectAll` uses `element.querySelectorAll`, `:scope` refers to self
    // see https://developer.mozilla.org/en-US/docs/Web/CSS/:scope
    button.selectAll(':scope > .icon use')
      .style('transform-origin', isNorthUp ? null : 'center')
      .style('transform', isNorthUp ? null : `rotate(${rot}rad)`);
  }
}
