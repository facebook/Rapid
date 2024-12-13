import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { vecAdd } from '@rapid-sdk/math';

import { uiIcon } from './icon.js';
import { utilRebind } from '../util/index.js';

/**
 * uiMapRouletteMenu
 * Creates a MapRoulette menu UI component.
 * @param {Object} context
 * @return {Function} The MapRoulette menu component.
 */
export function uiMapRouletteMenu(context) {
  const dispatch = d3_dispatch('toggled', 'change');
  const maproulette = context.services.maproulette;
  const gfx = context.systems.gfx;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const viewport = context.viewport;

  // Constants for layout and positioning
  const VIEW_TOP_MARGIN = 85;
  const VIEW_BOTTOM_MARGIN = 45;
  const VIEW_SIDE_MARGIN = 35;
  const MENU_SIDE_MARGIN = 10;
  const VERTICAL_PADDING = 4;

  // Internal state variables
  let _menu = d3_select(null);
  let _anchorLoc = [0, 0];
  let _initialScale = 0;
  let _triggerType = '';
  let _menuTop = false;
  let _menuHeight;
  let _menuWidth;
  let _qaItem;
  let _mapRouletteApiKey;


  /**
   * mapRouletteMenu
   * Initializes and displays the MapRoulette menu.
   * @param {Selection} selection
   */
  function mapRouletteMenu(selection) {
    if (_triggerType === undefined) {
      _triggerType = 'rightclick';
    }

    const isTouchMenu = _triggerType.includes('touch') || _triggerType.includes('pen');
    _menuTop = isTouchMenu;

    let showLabels = true;
    const actionTitles = [
      l10n.t('map_data.layers.maproulette.fixed'),
      l10n.t('map_data.layers.maproulette.cantComplete'),
      l10n.t('map_data.layers.maproulette.alreadyFixed'),
      l10n.t('map_data.layers.maproulette.notAnIssue')
    ];
    const buttonHeight = showLabels ? 32 : 34;
    _menuWidth = showLabels ? 52 + Math.min(120, 6 * Math.max.apply(Math, actionTitles.map(title => title.length))) : 44;
    _menuHeight = VERTICAL_PADDING * 2 + 4 * buttonHeight; // 4 actions
    _initialScale = viewport.transform.scale;

    const wrap = selection.selectAll('.maproulette-menu').data([0]);
    const wrapEnter = wrap.enter()
      .append('div')
      .attr('class', 'maproulette-menu')
      .style('padding', VERTICAL_PADDING + 'px 0');

    _menu = wrap.merge(wrapEnter);

    const buttonsEnter = _menu.selectAll('.maproulette-menu-item')
      .data(['fixed', 'cantComplete', 'alreadyFixed', 'notAnIssue'])
      .enter()
      .append('button')
      .attr('class', d => `maproulette-menu-item maproulette-menu-item-${d}`)
      .style('height', `${buttonHeight}px`)
      .on('click', (d3_event, actionId) => {
        if (!_mapRouletteApiKey) {
          getMapRouletteApiKey(context, (err, apiKey) => {
            if (err) {
              console.error('Error retrieving MapRoulette API key:', err); // eslint-disable-line no-console
              return;
            }
            _mapRouletteApiKey = apiKey;
            executeAction(actionId, d3_event);
          });
        } else {
          executeAction(actionId, d3_event);
        }
        mapRouletteMenu.close();
      });

    buttonsEnter.append('div')
      .attr('class', 'icon-wrap')
      .call(uiIcon('', 'operation'));

    buttonsEnter.append('span')
      .attr('class', 'label')
      .text(actionId => l10n.t(`map_data.layers.maproulette.${actionId}`));

    _updatePosition();
    map.off('move', _updatePosition);
    map.on('move', _updatePosition);

    dispatch.call('toggled', this, true);
  }


  /**
   * executeAction
   * Executes the specified action based on the user's selection.
   * @param {string} actionId - The ID of the action to execute.
   * @param {Event} d3_event
   */
  function executeAction(actionId, d3_event) {
    switch (actionId) {
      case 'fixed':
        fixedIt(d3_event, _qaItem);
        break;
      case 'cantComplete':
        cantComplete(d3_event, _qaItem);
        break;
      case 'alreadyFixed':
        alreadyFixed(d3_event, _qaItem);
        break;
      case 'notAnIssue':
        notAnIssue(d3_event, _qaItem);
        break;
    }
  }


  /**
   * _updatePosition
   * Updates the position of the menu based on the viewport and anchor location.
   */
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


    /**
     * displayOnLeft
     * Determines whether the menu should be displayed on the left or right.
     * @param {DOMRect} surfaceRect - The bounding rectangle of the surface.
     * @return {boolean} True if the menu should be displayed on the left, false otherwise.
     */
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


  /**
   * fixedIt
   * Marks the task as fixed and submits it.
   * @param {Event} d3_event - The D3 event object.
   * @param {Object} d - The task data.
   */
  function fixedIt(d3_event, d) {
    d._status = 1;
    submitTask(d3_event, d);
  }


  /**
   * cantComplete
   * Marks the task as cannot be completed and submits it.
   * @param {Event} d3_event - The D3 event object.
   * @param {Object} d - The task data.
   */
  function cantComplete(d3_event, d) {
    d._status = 6;
    submitTask(d3_event, d);
  }


  /**
   * alreadyFixed
   * Marks the task as already fixed and submits it.
   * @param {Event} d3_event - The D3 event object.
   * @param {Object} d - The task data.
   */
  function alreadyFixed(d3_event, d) {
    d._status = 5;
    submitTask(d3_event, d);
  }


  /**
   * notAnIssue
   * Marks the task as not an issue and submits it.
   * @param {Event} d3_event - The D3 event object.
   * @param {Object} d - The task data.
   */
  function notAnIssue(d3_event, d) {
    d._status = 2;
    submitTask(d3_event, d);
  }


  /**
   * submitTask
   * Submits the task to MapRoulette with the updated status.
   * @param {Event} d3_event - The D3 event object.
   * @param {Object} d - The task data.
   */
  function submitTask(d3_event, d) {
    if (!d) {
      console.error('No task to submit'); // eslint-disable-line no-console
      return;
    }
    const osm = context.services.osm;
    const userID = osm._userDetails.id;
    if (maproulette) {
      d.taskStatus = d._status;
      d.mapRouletteApiKey = _mapRouletteApiKey;

      const commentInput = d3_select('.new-comment-input');
      if (commentInput.empty()) {
        d.comment = '';
      } else {
        d.comment = commentInput.property('value').trim();
      }

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


  /**
   * getMapRouletteApiKey
   * Retrieves the MapRoulette API key from the user's preferences.
   * @param {Object} context - The application context.
   * @param {Function} callback - Callback function to handle the API key retrieval.
   */
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


  /**
   * mapRouletteMenu.close
   * Closes the MapRoulette menu and cleans up event listeners.
   */
  mapRouletteMenu.close = function() {
    map.off('move', _updatePosition);
    _menu.remove();
    dispatch.call('toggled', this, false);
    const uiSystem = context.systems.ui;
    uiSystem._showsMapRouletteMenu = false; // Reset state
  };


  /**
   * mapRouletteMenu.anchorLoc
   * Gets or sets the anchor location for the menu.
   * @param {Array} [val] - The new anchor location.
   * @return {Array|Function} The current anchor location or the menu component.
   */
  mapRouletteMenu.anchorLoc = function(val) {
    if (!arguments.length) return _anchorLoc;
    _anchorLoc = val;
    return mapRouletteMenu;
  };


  /**
   * mapRouletteMenu.triggerType
   * Gets or sets the trigger type for the menu.
   * @param {string} [val] - The new trigger type.
   * @return {string|Function} The current trigger type or the menu component.
   */
  mapRouletteMenu.triggerType = function(val) {
    if (!arguments.length) return _triggerType;
    _triggerType = val;
    return mapRouletteMenu;
  };


  /**
   * mapRouletteMenu.error
   * Gets or sets the QA item associated with the menu.
   * @param {Object} [val] - The new QA item.
   * @return {Object|Function} The current QA item or the menu component.
   */
  mapRouletteMenu.error = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return mapRouletteMenu;
  };

  return utilRebind(mapRouletteMenu, dispatch, 'on');
}