import { select as d3_select } from 'd3-selection';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { vecAdd } from '@rapid-sdk/math';

import { uiTooltip } from './tooltip.js';
import { uiIcon } from './icon.js';
import { utilHighlightEntities, utilRebind } from '../util/index.js';


export function uiEditMenu(context) {
  const dispatch = d3_dispatch('toggled');

  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const ui = context.systems.ui;
  const viewport = context.viewport;

  const VIEW_TOP_MARGIN = 85;     // viewport top margin
  const VIEW_BOTTOM_MARGIN = 45;  // viewport bottom margin
  const VIEW_SIDE_MARGIN = 35;    // viewport side margin
  const MENU_SIDE_MARGIN = 10;    // offset the menu slightly from the target location
  const VERTICAL_PADDING = 4;     // hardcode these values to make menu positioning easier
  const TOOLTIP_WIDTH = 210;      // see also `.edit-menu .tooltip` CSS; include margin

  // Menu state, these are locked in when menu is initially shown
  // but needed later if the menu is repositioned
  let _menu = d3_select(null);
  let _operations = [];
  let _tooltips = new Map;   // Map(id -> tooltip)
  let _anchorLoc = [0, 0];   // Array [lon,lat] wgs84 coordinate where the menu should be anchored
  let _initialScale = 0;
  let _triggerType = '';     // 'touch', 'pen', or 'rightclick'
  let _menuTop = false;
  let _menuHeight;
  let _menuWidth;


  /* this is the render function */
  let editMenu = function(selection) {
    if (_triggerType === undefined) {
      _triggerType = 'rightclick';
    }

    const isTouchMenu = _triggerType.includes('touch') || _triggerType.includes('pen');
    const ops = _operations.filter(op => !isTouchMenu || !op.mouseOnly);
    if (!ops.length) return;

    // Position the menu above the anchor for stylus and finger input
    // since the mapper's hand likely obscures the screen below the anchor
    _menuTop = isTouchMenu;

    // Show labels for touch input since there aren't hover tooltips
    // bhousel 8/10/22 - show always, this menu just looks better with labels
    let showLabels = true; // isTouchMenu;

    const buttonHeight = showLabels ? 32 : 34;
    if (showLabels) {
      // Get a general idea of the width based on the length of the label
      _menuWidth = 52 + Math.min(120, 6 * Math.max.apply(Math, ops.map(function(op) {
        return op.title.length;
      })));
    } else {
      _menuWidth = 44;
    }

    _menuHeight = VERTICAL_PADDING * 2 + ops.length * buttonHeight;
    _initialScale = viewport.transform.scale;

    const wrap = selection.selectAll('.edit-menu')
      .data([0]);

    const wrapEnter = wrap.enter()
      .append('div')
      .attr('class', 'edit-menu')
      .classed('touch-menu', isTouchMenu)
      .style('padding', VERTICAL_PADDING + 'px 0');

    _menu = wrap.merge(wrapEnter);

    let buttons = _menu.selectAll('.edit-menu-item')
      .data(ops, d => d.id);

    // Exit
    buttons.exit()
      .remove();

    // Enter
    const buttonsEnter = buttons.enter()
      .append('button')
      .attr('class', d => `edit-menu-item edit-menu-item-${d.id}`)
      .style('height', `${buttonHeight}px`)
      .on('click', _click)
      // don't listen for `mouseup` because we only care about non-mouse pointer types
      .on('pointerup', _pointerup)
      .on('pointerdown mousedown', function(d3_event) {
        // don't let button presses also act as map input - iD#1869
        d3_event.stopPropagation();
      })
      .on('mouseenter.highlight', function(d3_event, d) {
        if (!d.relatedEntityIds || d3_select(this).classed('disabled')) return;
        utilHighlightEntities(d.relatedEntityIds(), true, context);
      })
      .on('mouseleave.highlight', function(d3_event, d) {
        if (!d.relatedEntityIds) return;
        utilHighlightEntities(d.relatedEntityIds(), false, context);
      });

    // create placeholder icon, label, tooltip
    buttonsEnter.each((d, i, nodes) => {
      const buttonEnter = d3_select(nodes[i]);

      buttonEnter
        .append('div')
        .attr('class', 'icon-wrap')
        .call(uiIcon('', 'operation'));

      if (showLabels) {
        buttonEnter
          .append('span')
          .attr('class', 'label');
      }

      const tooltip = uiTooltip(context);
      _tooltips.set(d.id, tooltip);
      buttonEnter
        .call(tooltip);
    });


    // Update
    buttons = buttons.merge(buttonsEnter);

    // refresh with current data
    buttons.each((d, i, nodes) => {
      const button = d3_select(nodes[i]);

      button
        .classed('disabled', d => d.disabled());

      button.selectAll('.icon-wrap use')
        .attr('href', `#rapid-operation-${d.id}`);

      button.selectAll('.label')
        .text(d => d.title);

      const tooltip = _tooltips.get(d.id);
      if (tooltip) {
        tooltip
          .heading(d.title)
          .title(d.tooltip())
          .shortcut(d.keys[0]);  // display the first key combo, if there are alternates
      }
    });

    // Update menu position (and keep it updated as the map moves)
    _updatePosition();
    map.off('move', _updatePosition);
    map.on('move', _updatePosition);


    // `pointerup` is always called before `click`
    let _lastPointerUpType;
    function _pointerup(d3_event) {
      _lastPointerUpType = d3_event.pointerType;
    }

    function _click(d3_event, operation) {
      d3_event.stopPropagation();

      if (operation.relatedEntityIds) {
        utilHighlightEntities(operation.relatedEntityIds(), false, context);
      }

      if (operation.disabled()) {
        if (_lastPointerUpType === 'touch' || _lastPointerUpType === 'pen') {
          // there are no tooltips for touch interactions so flash feedback instead
          ui.flash
            .duration(4000)
            .iconName(`#rapid-operation-${operation.id}`)
            .iconClass('operation disabled')
            .label(operation.tooltip)();
        }
      } else {
        if (_lastPointerUpType === 'touch' || _lastPointerUpType === 'pen') {
          ui.flash
            .duration(2000)
            .iconName(`#rapid-operation-${operation.id}`)
            .iconClass('operation')
            .label(operation.annotation() || operation.title)();
        }

        operation();
        editMenu.close();
      }
      _lastPointerUpType = null;
    }

    dispatch.call('toggled', this, true);
  };


  /*
   * _updatePosition
   * Called whenever the map moves so that the menu can be repostioned to match the map.
   */
  function _updatePosition() {
    if (!_menu || _menu.empty()) return;

    // close the menu if the scale (zoom) has changed
    // (this is because the menu will scale with the supersurface and look wrong)
    if (_initialScale !== viewport.transform.scale) {
      editMenu.close();
      return;
    }

    const anchor = viewport.project(_anchorLoc, true);  // convert wgs84 [lon,lat] to screen [x,y]
    const surfaceRect = context.surfaceRect();

    // close the menu if it's gone offscreen
    if (anchor[0] < 0 || anchor[0] > surfaceRect.width || anchor[1] < 0 || anchor[1] > surfaceRect.height) {
      editMenu.close();
      return;
    }

    const menuLeft = displayOnLeft(surfaceRect);
    let offset = [0, 0];

    offset[0] = menuLeft ? -1 * (MENU_SIDE_MARGIN + _menuWidth) : MENU_SIDE_MARGIN;

    if (_menuTop) {
      if (anchor[1] - _menuHeight < VIEW_TOP_MARGIN) {
        // menu is near top viewport edge, shift downward
        offset[1] = -anchor[1] + VIEW_TOP_MARGIN;
      } else {
        offset[1] = -_menuHeight;
      }
    } else {
      if (anchor[1] + _menuHeight > (surfaceRect.height - VIEW_BOTTOM_MARGIN)) {
        // menu is near bottom viewport edge, shift upwards
        offset[1] = -anchor[1] - _menuHeight + surfaceRect.height - VIEW_BOTTOM_MARGIN;
      } else {
        offset[1] = 0;
      }
    }

    const [left, top] = vecAdd(anchor, offset);
    _menu
      .style('left', `${left}px`)
      .style('top', `${top}px`);

    const tooltipSide = tooltipPosition(surfaceRect, menuLeft);
    for (const tip of _tooltips.values()) {
      tip.placement(tooltipSide);
      if (tip.isShown()) {
        tip.updateContent();  // refresh it
      }
    }


    function displayOnLeft(surfaceRect) {
      const isRTL = l10n.isRTL();
      if (isRTL) {  // right to left
        if ((anchor[0] - MENU_SIDE_MARGIN - _menuWidth) < VIEW_SIDE_MARGIN) {
          return false;  // left menu would be too close to the left viewport edge, go right
        } else {
          return true;   // prefer left menu
        }
      } else {  // left to right
        if ((anchor[0] + MENU_SIDE_MARGIN + _menuWidth) > (surfaceRect.width - VIEW_SIDE_MARGIN)) {
          return true;   // right menu would be too close to the right viewport edge, go left
        } else {
          return false;  // prefer right menu
        }
      }
    }


    function tooltipPosition(surfaceRect, menuLeft) {
      const isRTL = l10n.isRTL();
      if (isRTL) {  // right to left
        if (!menuLeft) {
          return 'right';
        }
        if ((anchor[0] - MENU_SIDE_MARGIN - _menuWidth - TOOLTIP_WIDTH) < VIEW_SIDE_MARGIN) {
          // left tooltips would be too close to the left viewport edge, go right
          return 'right';
        }
        return 'left';

      } else {  // left to right
        if (menuLeft) {
          // if there's not room for a right-side menu then there definitely
          // isn't room for right-side tooltips
          return 'left';
        }
        if ((anchor[0] + MENU_SIDE_MARGIN + _menuWidth + TOOLTIP_WIDTH) > (surfaceRect.width - VIEW_SIDE_MARGIN)) {
          // right tooltips would be too close to the right viewport edge, go left
          return 'left';
        }
        return 'right';
      }
    }

  }


  /*
   * close
   * This removes the menu and unbinds the event handlers
   */
  editMenu.close = function () {
     map.off('move', _updatePosition);

    _menu.remove();
    _tooltips.clear();

    dispatch.call('toggled', this, false);
  };


  /*
   * anchorLoc
   * Array [lon,lat] wgs84 coordinate where the menu should be anchored
   */
  editMenu.anchorLoc = function(val) {
    if (!arguments.length) return _anchorLoc;
    _anchorLoc = val;
    return editMenu;
  };


  /*
   * triggerType
   * String  'touch', 'pen', or 'rightclick' that triggered the menu
   */
  editMenu.triggerType = function(val) {
    if (!arguments.length) return _triggerType;
    _triggerType = val;
    return editMenu;
  };


  /*
   * operations
   * Array of operations requested to appear on the menu
   * Some operations may be skipped if we've detected pen/touch input
   */
  editMenu.operations = function(val) {
    if (!arguments.length) return _operations;
    _operations = val;
    return editMenu;
  };

  return utilRebind(editMenu, dispatch, 'on');
}
