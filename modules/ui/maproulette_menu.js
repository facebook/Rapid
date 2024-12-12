import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { vecAdd } from '@rapid-sdk/math';

import { uiIcon } from './icon.js';
import { utilHighlightEntities, utilRebind } from '../util/index.js';

export function uiMapRouletteMenu(context) {
  const dispatch = d3_dispatch('toggled');
  const maproulette = context.services.maproulette;
  const gfx = context.systems.gfx;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const viewport = context.viewport;

  const VIEW_TOP_MARGIN = 85;
  const VIEW_BOTTOM_MARGIN = 45;
  const VIEW_SIDE_MARGIN = 35;
  const MENU_SIDE_MARGIN = 10;
  const VERTICAL_PADDING = 4;

  let _menu = d3_select(null);
  let _anchorLoc = [0, 0];
  let _initialScale = 0;
  let _triggerType = '';
  let _menuTop = false;
  let _menuHeight;
  let _menuWidth;
  let _qaItem;
  let _actionTaken;
  let _mapRouletteApiKey;

  const actions = [
    { id: 'fixed', title: l10n.t('map_data.layers.maproulette.fixedIt'), action: fixedIt },
    { id: 'cantComplete', title: l10n.t('map_data.layers.maproulette.cantComplete'), action: cantComplete },
    { id: 'alreadyFixed', title: l10n.t('map_data.layers.maproulette.alreadyFixed'), action: alreadyFixed },
    { id: 'notAnIssue', title: l10n.t('map_data.layers.maproulette.notAnIssue'), action: notAnIssue }
  ];

  function mapRouletteMenu(selection) {
    if (_triggerType === undefined) {
      _triggerType = 'rightclick';
    }

    const isTouchMenu = _triggerType.includes('touch') || _triggerType.includes('pen');
    const ops = actions.filter(action => !isTouchMenu || !action.mouseOnly);
    _menuTop = isTouchMenu;

    let showLabels = true;

    const buttonHeight = showLabels ? 32 : 34;
    if (showLabels) {
      _menuWidth = 52 + Math.min(120, 6 * Math.max.apply(Math, ops.map(op => op.title.length)));
    } else {
      _menuWidth = 44;
    }

    _menuHeight = VERTICAL_PADDING * 2 + actions.length * buttonHeight;
    _initialScale = viewport.transform.scale;

    const wrap = selection.selectAll('.maproulette-menu')
      .data([0]);

    const wrapEnter = wrap.enter()
      .append('div')
      .attr('class', 'maproulette-menu')
      .style('padding', VERTICAL_PADDING + 'px 0');

    _menu = wrap.merge(wrapEnter);

    let buttons = _menu.selectAll('.maproulette-menu-item')
      .data(actions, d => d.id);

    buttons.exit().remove();

    const buttonsEnter = buttons.enter()
      .append('button')
      .attr('class', d => `maproulette-menu-item maproulette-menu-item-${d.id}`)
      .style('height', `${buttonHeight}px`)
      .on('click', (d3_event, d) => {
        if (!_mapRouletteApiKey) {
          getMapRouletteApiKey(context, (err, apiKey) => {
            if (err) {
              console.error('Error retrieving MapRoulette API key:', err);
              return;
            }
            _mapRouletteApiKey = apiKey;
            d.action(d3_event, d);
          });
        } else {
          d.action(d3_event, d);
        }
        mapRouletteMenu.close();
      })
      .on('mouseenter.highlight', function(d3_event, d) {
        if (!d.relatedEntityIds || d3_select(this).classed('disabled')) return;
        utilHighlightEntities(d.relatedEntityIds(), true, context);
      })
      .on('mouseleave.highlight', function(d3_event, d) {
        if (!d.relatedEntityIds) return;
        utilHighlightEntities(d.relatedEntityIds(), false, context);
      });

    buttonsEnter.append('div')
      .attr('class', 'icon-wrap')
      .call(uiIcon('', 'operation'));

    buttonsEnter.append('span')
      .attr('class', 'label')
      .text(d => d.title);

    buttons = buttons.merge(buttonsEnter);

    _updatePosition();
    map.off('move', _updatePosition);
    map.on('move', _updatePosition);

    dispatch.call('toggled', this, true);
  }

  function _updatePosition() {
    if (!_menu || _menu.empty()) return;

    if (_initialScale !== viewport.transform.scale) {
      mapRouletteMenu.close();
      return;
    }

    const anchor = viewport.project(_anchorLoc, true);
    const surfaceRect = gfx.surface.getBoundingClientRect();

    if (anchor[0] < 0 || anchor[0] > surfaceRect.width || anchor[1] < 0 || anchor[1] > surfaceRect.height) {
      mapRouletteMenu.close();
      return;
    }

    const menuLeft = displayOnLeft(surfaceRect);
    let offset = [0, 0];

    offset[0] = menuLeft ? -1 * (MENU_SIDE_MARGIN + _menuWidth) : MENU_SIDE_MARGIN;

    if (_menuTop) {
      if (anchor[1] - _menuHeight < VIEW_TOP_MARGIN) {
        offset[1] = -anchor[1] + VIEW_TOP_MARGIN;
      } else {
        offset[1] = -_menuHeight;
      }
    } else {
      if (anchor[1] + _menuHeight > (surfaceRect.height - VIEW_BOTTOM_MARGIN)) {
        offset[1] = -anchor[1] - _menuHeight + surfaceRect.height - VIEW_BOTTOM_MARGIN;
      } else {
        offset[1] = 0;
      }
    }

    const [left, top] = vecAdd(anchor, offset);
    _menu
      .style('left', `${left}px`)
      .style('top', `${top}px`);

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
  }


  function fixedIt(d3_event, d) {
    console.log('Current d in fixedIt:', d);
    d._status = 1;
    _actionTaken = 'FIXED';
    submitTask(d3_event, d);
  }


  function cantComplete(d3_event, d) {
      d._status = 6;
      _actionTaken = `CAN'T COMPLETE`;
      submitTask(d3_event, d);
  }

  function alreadyFixed(d3_event, d) {
      d._status = 5;
      _actionTaken = 'ALREADY FIXED';
      submitTask(d3_event, d);
  }

  function notAnIssue(d3_event, d) {
      d._status = 2;
      _actionTaken = 'NOT AN ISSUE';
      submitTask(d3_event, d);
  }


  function submitTask(d3_event, d) {
    if (!d) {
      console.error('No task to submit');
      return;
    }
    const osm = context.services.osm;
    const userID = osm._userDetails.id;
    if (maproulette) {
      d.taskStatus = d._status;
      d.mapRouletteApiKey = _mapRouletteApiKey;
      d.comment = d3_select('.new-comment-input').property('value').trim();
      d.taskId = d.id;
      d.userId = userID;
      maproulette.postUpdate(d, (err, item) => {
        if (err) {
          console.error(err);  // eslint-disable-line no-console
          return;
        }
        dispatch.call('change', item);
        if (maproulette.nearbyTaskEnabled) {
          maproulette.flyToNearbyTask(d);
        }
      });
    }
  }

  function getMapRouletteApiKey(context, callback) {
    const osm = context.services.osm;
    osm.loadMapRouletteKey((err, preferences) => {
      if (typeof callback === 'function') {
        if (err) {
          callback(err);
        } else {
          callback(null, preferences.maproulette_apikey_v2);
        }
      }
    });
  }

  mapRouletteMenu.close = function() {
    map.off('move', _updatePosition);
    _menu.remove();
    dispatch.call('toggled', this, false);
    const uiSystem = context.systems.ui;
    uiSystem._showsMapRouletteMenu = false; // Reset state
  };

  mapRouletteMenu.anchorLoc = function(val) {
    if (!arguments.length) return _anchorLoc;
    _anchorLoc = val;
    return mapRouletteMenu;
  };

  mapRouletteMenu.triggerType = function(val) {
    if (!arguments.length) return _triggerType;
    _triggerType = val;
    return mapRouletteMenu;
  };

  mapRouletteMenu.error = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    console.log('_qaItem',_qaItem);
    _actionTaken = '';
    return mapRouletteMenu;
  };

  return utilRebind(mapRouletteMenu, dispatch, 'on');
}