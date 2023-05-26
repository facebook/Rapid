import { select as d3_select } from 'd3-selection';

import { uiIcon } from './icon';
import { uiTooltip } from './tooltip';


export function uiPane(context, id) {
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

  pane.selection = function() {
    return _paneSelection;
  };

  function hidePane() {
    context.ui().togglePanes();
  }

  pane.togglePane = function(d3_event) {
    if (d3_event) d3_event.preventDefault();
    _paneTooltip.hide();
    const shown = !_paneSelection.classed('shown');
    context.ui().togglePanes(shown ? _paneSelection : undefined);

    // iD#655: Since firing the validator is so expensive,
    // only do it when we're right about to open the validation pane.
    if (pane.id === 'issues' && shown) {
      context.validationSystem().validate();
    }
  };

  pane.renderToggleButton = function(selection) {
    if (!_paneTooltip) {
      const isRTL = context.localizationSystem().isRTL();
      _paneTooltip = uiTooltip(context)
        .placement(isRTL ? 'right' : 'left')
        .title(_description)
        .keys([_key]);
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
      .html(_label);

    heading
      .append('button')
      .on('click', hidePane)
      .call(uiIcon('#rapid-icon-close'));


    _paneSelection
      .append('div')
      .attr('class', 'pane-content')
      .call(pane.renderContent);

    if (_key) {
      context.keybinding()
        .on(_key, pane.togglePane);
    }
  };

  return pane;
}
