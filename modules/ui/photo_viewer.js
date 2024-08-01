import { numClamp } from '@rapid-sdk/math';
import { select as d3_select } from 'd3-selection';
import { dispatch as d3_dispatch } from 'd3-dispatch';

import { uiIcon } from './icon.js';
import { utilGetDimensions, utilRebind } from '../util/index.js';


export function uiPhotoViewer(context) {
  const ui = context.systems.ui;
  const dispatch = d3_dispatch('resize');


  function photoviewer(selection) {
    selection
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


    function preventDefault(d3_event) {
      d3_event.preventDefault();
    }

    selection
      .append('button')
      .attr('class', 'resize-handle-xy')
      .on('touchstart touchdown touchend', preventDefault)
      .on('pointerdown', buildResizeListener(selection, 'resize', { resizeOnX: true, resizeOnY: true }) );

    selection
      .append('button')
      .attr('class', 'resize-handle-x')
      .on('touchstart touchdown touchend', preventDefault)
      .on('pointerdown', buildResizeListener(selection, 'resize', { resizeOnX: true }) );

    selection
      .append('button')
      .attr('class', 'resize-handle-y')
      .on('touchstart touchdown touchend', preventDefault)
      .on('pointerdown', buildResizeListener(selection, 'resize', { resizeOnY: true }) );


    function buildResizeListener(target, eventName, options) {
      const resizeOnX = !!options.resizeOnX;
      const resizeOnY = !!options.resizeOnY;
      const minHeight = options.minHeight || 240;
      const minWidth = options.minWidth || 320;
      let pointerId;
      let startX;
      let startY;
      let startWidth;
      let startHeight;

      function startResize(d3_event) {
        if (pointerId !== (d3_event.pointerId || 'mouse')) return;

        d3_event.preventDefault();
        d3_event.stopPropagation();

        const dims = context.viewport.dimensions;
        if (resizeOnX) {
          const maxWidth = dims[0];
          const newWidth = numClamp((startWidth + d3_event.clientX - startX), minWidth, maxWidth);
          target.style('width', newWidth + 'px');
        }
        if (resizeOnY) {
          const maxHeight = dims[1] - 90;  // preserve space at top/bottom of map
          const newHeight = numClamp((startHeight + startY - d3_event.clientY), minHeight, maxHeight);
          target.style('height', newHeight + 'px');
        }

        dispatch.call(eventName, target, utilGetDimensions(target, true));
      }

      function stopResize(d3_event) {
        if (pointerId !== (d3_event.pointerId || 'mouse')) return;

        d3_event.preventDefault();
        d3_event.stopPropagation();

        // remove all the listeners we added
        d3_select(window)
          .on('.' + eventName, null);
      }

      return function initResize(d3_event) {
        d3_event.preventDefault();
        d3_event.stopPropagation();

        pointerId = d3_event.pointerId || 'mouse';
        startX = d3_event.clientX;
        startY = d3_event.clientY;

        const targetRect = target.node().getBoundingClientRect();
        startWidth = targetRect.width;
        startHeight = targetRect.height;

        d3_select(window)
          .on('pointermove.' + eventName, startResize, false)
          .on('pointerup.' + eventName, stopResize, false)
          .on('pointercancel.' + eventName, stopResize, false);
      };
    }
  }


  function _onMapResize() {
    const photoviewer = context.container().select('.photoviewer');
    const content = context.container().select('.main-content');
    const mapDimensions = utilGetDimensions(content, true);
    // shrink photo viewer if it is too big
    // (-90 preserves space at top and bottom of map used by menus)
    const photoDimensions = utilGetDimensions(photoviewer, true);
    if (photoDimensions[0] > mapDimensions[0] || photoDimensions[1] > (mapDimensions[1] - 90)) {
      const setPhotoDimensions = [
        Math.min(photoDimensions[0], mapDimensions[0]),
        Math.min(photoDimensions[1], mapDimensions[1] - 90),
      ];

      photoviewer
        .style('width', setPhotoDimensions[0] + 'px')
        .style('height', setPhotoDimensions[1] + 'px');

      dispatch.call('resize', photoviewer, setPhotoDimensions);
    }
  }

  ui.on('uichange', _onMapResize);

  return utilRebind(photoviewer, dispatch, 'on');
}
