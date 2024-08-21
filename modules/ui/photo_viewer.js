import { numClamp } from '@rapid-sdk/math';
import { select as d3_select } from 'd3-selection';
import { dispatch as d3_dispatch } from 'd3-dispatch';

import { uiIcon } from './icon.js';
import { utilRebind } from '../util/index.js';


export function uiPhotoViewer(context) {
  const l10n = context.systems.l10n;
  const ui = context.systems.ui;
  const dispatch = d3_dispatch('resize');
  const [minH, minW] = [240, 320];


  function photoviewer($selection) {
    const isRTL = l10n.isRTL();

    // Close 'X' button
    $selection.selectAll('.thumb-hide')
      .data([0])
      .enter()
      .append('button')
      .attr('class', 'thumb-hide')
      .on('click', () => {
        for (const serviceID of ['mapillary', 'kartaview', 'streetside']) {
          const service = context.services[serviceID];
          service?.hideViewer();
        }
      })
      .append('div')
      .call(uiIcon('#rapid-icon-close'));

    // Construct the nineslice grid
    for (const y of ['top', 'middle', 'bottom']) {
      for (const x of ['left', 'middle', 'right']) {
        const k = `${y}-${x}`;

        // enter
        $selection
          .selectAll(`.${k}`)
          .data([0])
          .enter()
          .append('div')
          .attr('class', k)
          .on('touchstart touchdown touchend', e => e.preventDefault());

        // update - apply the appropriate resizing behaviors
        const $cell = $selection
          .selectAll(`.${k}`);

        if (k === 'top-left' && isRTL) {
          $cell
            .style('cursor', 'nwse-resize')
            .on('pointerdown', buildResizer(k));

        } else if (k === 'top-middle') {
          $cell
            .style('cursor', 'ns-resize')
            .on('pointerdown', buildResizer(k));

        } else if (k === 'top-right' && !isRTL) {
          $cell
            .style('cursor', 'nesw-resize')
            .on('pointerdown', buildResizer(k));

        } else if (k === 'middle-left' && isRTL) {
          $cell
            .style('cursor', 'ew-resize')
            .on('pointerdown', buildResizer(k));

        } else if (k === 'middle-right' && !isRTL) {
          $cell
            .style('cursor', 'ew-resize')
            .on('pointerdown', buildResizer(k));

        } else {
          $cell
            .style('cursor', null)
            .on('pointerdown', null);
        }
      }
    }



    function buildResizer(k) {

      // For now, the target is the photoviewer div we were passed in $selection..
      const $target = $selection;

      let pointerId;
      let startX, startY, rectW, rectH;

      function _pointerdown(e) {
        e.preventDefault();
        e.stopPropagation();

        pointerId = e.pointerId || 'mouse';
        startX = e.clientX;
        startY = e.clientY;

        const rect = $target.node().getBoundingClientRect();
        rectW = rect.width;
        rectH = rect.height;

        d3_select(window)
          .on('pointermove.resize', _pointermove)
          .on('pointerup.resize pointercancel.resize', _pointerup);
      }


      function _pointermove(e) {
        if (pointerId !== (e.pointerId || 'mouse')) return;

        e.preventDefault();
        e.stopPropagation();

        const $content = context.container().selectAll('.main-content');
        const mapRect = $content.node().getBoundingClientRect();
        const [maxW, maxH] = [mapRect.width - 45, mapRect.height - 105];  // allow for toolbars

        let [w, h] = [rectW, rectH];
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (/left/.test(k))   w -= dx;
        if (/right/.test(k))  w += dx;
        if (/top/.test(k))    h -= dy;

        w = numClamp(w, minW, maxW);
        h = numClamp(h, minH, maxH);

        $target
          .style('width', `${w}px`)
          .style('height', `${h}px`);

        dispatch.call('resize', $target, [w, h]);
      }


      function _pointerup(e) {
        if (pointerId !== (e.pointerId || 'mouse')) return;

        e.preventDefault();
        e.stopPropagation();

        d3_select(window)
          .on('pointermove.resize pointerup.resize pointercancel.resize', null);
      }


      return _pointerdown;
    }
  }


  function _onMapResize() {
    const $container = context.container();

    const $content = $container.selectAll('.main-content');
    const $viewer = $container.selectAll('.photoviewer');
    if (!$content.size() || !$viewer.size()) return;  // called too early?

    const mapRect = $content.node().getBoundingClientRect();
    const viewerRect = $viewer.node().getBoundingClientRect();
    const [maxW, maxH] = [mapRect.width - 45, mapRect.height - 105];  // allow for toolbars
    const [w, h] = [viewerRect.width, viewerRect.height];
    if (w === 0 || h === 0) return;   // viewer is hidden

    const w2 = numClamp(w, minW, maxW);
    const h2 = numClamp(h, minH, maxH);

    if (w !== w2 || h !== h2) {
      $viewer
        .style('width', `${w2}px`)
        .style('height', `${h2}px`);

      dispatch.call('resize', $viewer, [w2, h2]);
    }
  }


  ui.on('uichange', _onMapResize);

  return utilRebind(photoviewer, dispatch, 'on');
}
