import { select as d3_select } from 'd3-selection';

import { uiIcon } from './icon.js';
import { uiTooltip } from './tooltip.js';


export function uiPane(context, id) {
  const l10n = context.systems.l10n;
  const ui = context.systems.ui;
  const validator = context.systems.validator;

  let _key;
  let _label = '';
  let _description = '';
  let _iconName = '';
  let _sections; // array of uiSection objects

  let _paneSelection = d3_select(null);
  let _paneTooltip;
  let pane = { id: id };

  pane.label = function(val) {
    if (!arguments.length) return _label;
    _label = val;
    return pane;
  };

  pane.key = function(val) {
    if (!arguments.length) return _key;
    _key = val;
    return pane;
  };

  pane.description = function(val) {
    if (!arguments.length) return _description;
    _description = val;
    return pane;
  };

  pane.iconName = function(val) {
    if (!arguments.length) return _iconName;
    _iconName = val;
    return pane;
  };

  pane.sections = function(val) {
    if (!arguments.length) return _sections;
    _sections = val;
    return pane;
  };

  function hidePane() {
    ui.togglePanes();
  }

  pane.togglePane = function(d3_event) {
    if (d3_event) d3_event.preventDefault();
    _paneTooltip.hide();

    const show = !_paneSelection.classed('shown');
    ui.togglePanes(show ? _paneSelection : undefined);

    // We are showing the pane, rerender its content
    if (show) {
      _paneSelection.selectAll('.pane-content')
        .call(pane.renderContent);

      // Rapid#655: Since firing the validator is so expensive,
      // only do it when we're right about to open the validation pane.
      if (pane.id === 'issues') {
        validator.validateAsync();
      }
    }
  };


  pane.renderToggleButton = function(selection) {
    if (!_paneTooltip) {
      const isRTL = l10n.isRTL();
      _paneTooltip = uiTooltip(context)
        .placement(isRTL ? 'right' : 'left')
        .title(_description)
        .shortcut(_key);
    }

    selection
      .append('button')
      .on('click', pane.togglePane)
      .call(uiIcon(`#${_iconName}`, 'light'))
      .call(_paneTooltip);
  };


  pane.renderContent = function(selection) {
    // override to fully customize content
    if (_sections) {
      for (const section of _sections) {
        selection.call(section.render);
      }
    }
  };


  pane.renderPane = function(selection) {
    _paneSelection = selection
      .append('div')
      .attr('class', `fillL map-pane hide ${id}-pane`)
      .attr('pane', id);

    let heading = _paneSelection
      .append('div')
      .attr('class', 'pane-heading');

    heading
      .append('h2')
      .text(_label);

    heading
      .append('button')
      .on('click', hidePane)
      .call(uiIcon('#rapid-icon-close'));

    _paneSelection
      .append('div')
      .attr('class', 'pane-content')
      .call(pane.renderContent);

    if (_key) {
      context.keybinding().off(_key);
      context.keybinding().on(_key, pane.togglePane);
    }
  };

  return pane;
}
