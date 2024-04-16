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

    const rot = viewport.transform.rotation;
    const isNorthUp = (rot === 0);

    let button = _selection.selectAll('button.bearing')
      .data([0]);

    // enter
    const buttonEnter = button.enter()
      .append('button')
      .attr('class', 'bearing');

    buttonEnter
      .append('div')
      .attr('class', 'bearing_n')
      .text(l10n.t('bearing.n'));  // the letter 'N'

    buttonEnter
      .call(tooltip);

    buttonEnter
      .call(uiIcon('#rapid-icon-compass', 'light'));

    // update
    button = button.merge(buttonEnter)
      .on('click', d3_event => {
        d3_event.preventDefault();
        const t = viewport.transform.props;
        map.transformEase(Object.assign(t, { r: 0 }));
      });

    tooltip
      .placement(l10n.isRTL() ? 'right' : 'left')
      .title(isNorthUp ? l10n.t('bearing.disabled') : l10n.t('bearing.title'));
      // .shortcut(d => d.key);

    // Translate the 'N' around opposite of the compass pointer
    const npos = vecRotate([0, 8], rot, [0, 0]);
    button.selectAll('.bearing_n')
      .style('transform', `translate(${npos[0]}px, ${npos[1]}px)`);

    button.selectAll('.icon use')
      .style('transform-origin', isNorthUp ? null : 'center')
      .style('transform', isNorthUp ? null : `rotate(${rot}rad)`);
  }
}
