import { select as d3_select } from 'd3-selection';
import { geoMetersToOffset, geoOffsetToMeters } from '@rapid-sdk/math';

import { uiIcon } from '../icon.js';
import { uiSection } from '../section.js';


export function uiSectionBackgroundOffset(context) {
  const l10n = context.systems.l10n;
  const imagery = context.systems.imagery;

  const section = uiSection(context, 'background-offset')
    .label(l10n.t('background.fix_misalignment'))
    .disclosureContent(renderDisclosureContent);

  const DIRECTIONS = [
    ['top', [0, -0.5]],
    ['left', [-0.5, 0]],
    ['right', [0.5, 0]],
    ['bottom', [0, 0.5]]
  ];


  function updateValue() {
    const meters = geoOffsetToMeters(imagery.offset);
    const x = +meters[0].toFixed(2);
    const y = +meters[1].toFixed(2);

    context.container().selectAll('.nudge-inner-rect')
      .select('input')
      .classed('error', false)
      .property('value', `${x},${y}`);

    context.container().selectAll('.nudge-reset')
      .classed('disabled', (x === 0 && y === 0));
  }


  function resetOffset() {
    imagery.offset = [0, 0];
    updateValue();
  }


  function nudge(d) {
    imagery.nudge(d);
    updateValue();
  }


  function inputOffset(d3_event) {
    let input = d3_select(d3_event.target);
    let val = input.node().value;

    if (val === '') return resetOffset();

    val = val.replace(/;/g, ',').split(',').map(n => {
      // if n is NaN, it will always get mapped to false.
      return !isNaN(n) && n;
    });

    if (val.length !== 2 || !val[0] || !val[1]) {
      input.classed('error', true);
      return;
    }

    imagery.offset = geoMetersToOffset(val);
    updateValue();
  }


  function dragOffset(d3_event) {
    if (d3_event.button !== 0) return;

    let origin = [d3_event.clientX, d3_event.clientY];
    const pointerId = d3_event.pointerId || 'mouse';

    context.container()
      .append('div')
      .attr('class', 'nudge-surface');

    d3_select(window)
      .on('pointermove.drag-bg-offset', pointermove)
      .on('pointerup.drag-bg-offset', pointerup)
      .on('pointercancel.drag-bg-offset', pointerup);


    function pointermove(d3_event) {
      if (pointerId !== (d3_event.pointerId || 'mouse')) return;

      const latest = [d3_event.clientX, d3_event.clientY];
      const delta = [
        -(origin[0] - latest[0]) / 4,
        -(origin[1] - latest[1]) / 4
      ];

      origin = latest;
      nudge(delta);
    }

    function pointerup(d3_event) {
      if (pointerId !== (d3_event.pointerId || 'mouse')) return;
      if (d3_event.button !== 0) return;

      context.container().selectAll('.nudge-surface')
        .remove();

      d3_select(window)
        .on('.drag-bg-offset', null);
    }
  }


  function renderDisclosureContent(selection) {
    let container = selection.selectAll('.nudge-container')
      .data([0]);

    let containerEnter = container.enter()
      .append('div')
      .attr('class', 'nudge-container');

    containerEnter
      .append('div')
      .attr('class', 'nudge-instructions')
      .text(l10n.t('background.offset'));

    let nudgeWrapEnter = containerEnter
      .append('div')
      .attr('class', 'nudge-controls-wrap');

    let nudgeEnter = nudgeWrapEnter
      .append('div')
      .attr('class', 'nudge-outer-rect')
      .on('pointerdown', dragOffset);

    nudgeEnter
      .append('div')
      .attr('class', 'nudge-inner-rect')
      .append('input')
      .attr('type', 'text')
      .on('change', inputOffset);

    nudgeWrapEnter
      .append('div')
      .selectAll('button')
      .data(DIRECTIONS).enter()
      .append('button')
      .attr('class', d => `${d[0]} nudge`)
      .attr('tabindex', -1)
      .on('click', (d3_event, d) => nudge(d[1]) );

    nudgeWrapEnter
      .append('button')
      .attr('title', l10n.t('background.reset'))
      .attr('class', 'nudge-reset disabled')
      .on('click', d3_event => {
        d3_event.preventDefault();
        resetOffset();
      })
      .call(uiIcon('#rapid-icon-' + (l10n.isRTL() ? 'redo' : 'undo')));

    updateValue();
  }

  imagery.on('imagerychange', updateValue);

  return section;
}
