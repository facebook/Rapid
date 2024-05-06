import { dispatch as d3_dispatch } from 'd3-dispatch';

import { uiIcon } from './icon.js';
import { uiToggle } from './toggle.js';
import { utilFunctor, utilRebind } from '../util/index.js';


// A Disclosure consists of a toggleable Label and Content
// Clicking on the label toggles the visibility of the content below it.
//
//   > Label     ⋁ Label
//                 Content
//
export function uiDisclosure(context, key) {
  const l10n = context.systems.l10n;
  const storage = context.systems.storage;
  const dispatch = d3_dispatch('toggled');

  let _isExpanded = true;        // by default, disclosures start out expanded
  let _checkPreference = true;   // by default, consider user's preference for whether it should be expanded
  let _expandOverride;           // expand can be overrided (for example, raw tag editor when it really needs to be open)
  let _label = utilFunctor('');
  let _content = function () {};


  let disclosure = function render(selection) {
    if (_checkPreference) {   // does user's preference override _isExpanded
      const preferExpanded = storage.getItem(`disclosure.${key}.expanded`) || 'true';
      _isExpanded = (preferExpanded === 'true');
    }
    if (_expandOverride !== undefined) {
      _isExpanded = _expandOverride;
    }


    let hideToggle = selection.selectAll(`.hide-toggle-${key}`)
      .data([0]);

    // enter
    let hideToggleEnter = hideToggle.enter()
      .append('a')
      .attr('href', '#')
      .attr('class', `hide-toggle hide-toggle-${key}`)
      .call(uiIcon('', 'pre-text hide-toggle-icon'));

    hideToggleEnter
      .append('span')
      .attr('class', 'hide-toggle-text');

    // update
    hideToggle = hideToggleEnter
      .merge(hideToggle);

    hideToggle
      .on('click', _onClick)
      .classed('expanded', _isExpanded);

    hideToggle.selectAll('.hide-toggle-text')
      .text(_label());

    const isRTL = l10n.isRTL();
    const icon = _isExpanded ? 'down' : isRTL ? 'backward' : 'forward';
    hideToggle.selectAll('.hide-toggle-icon > use')
      .attr('xlink:href', `#rapid-icon-${icon}`);


    let wrap = selection.selectAll('.disclosure-wrap')
      .data([0]);

    // enter/update
    wrap = wrap.enter()
      .append('div')
      .attr('class', `disclosure-wrap disclosure-wrap-${key}`)
      .merge(wrap)
      .classed('hide', !_isExpanded);

    if (_isExpanded) {
      wrap
        .call(_content);
    }


    function _onClick(d3_event) {
      d3_event.preventDefault();
      _isExpanded = !_isExpanded;

      // Only update the expanded preference if it's not been overrided
      if (_checkPreference && _expandOverride === undefined) {
        storage.setItem(`disclosure.${key}.expanded`, _isExpanded);
      }
      _expandOverride = undefined;  // reset this flag here, as the user has interacted with it

      hideToggle
        .classed('expanded', _isExpanded);

      const icon = _isExpanded ? 'down' : isRTL ? 'backward' : 'forward';
      hideToggle.selectAll('.hide-toggle-icon > use')
        .attr('xlink:href', `#rapid-icon-${icon}`);

      wrap
        .call(uiToggle(_isExpanded));

      if (_isExpanded) {
        wrap
          .call(_content);
      }

      dispatch.call('toggled', this, _isExpanded);
    }
  };


  disclosure.expanded = (val) => {
    if (!arguments.length) return _isExpanded;
    _isExpanded = val;
    return disclosure;
  };


  disclosure.checkPreference = (val) => {
    if (!arguments.length) return _checkPreference;
    _checkPreference = val;
    return disclosure;
  };


  disclosure.expandOverride = (val) => {
    if (!arguments.length) return _expandOverride;
    _expandOverride = val;
    return disclosure;
  };


  disclosure.label = (val) => {
    if (!arguments.length) return _label;
    _label = utilFunctor(val);
    return disclosure;
  };


  disclosure.content = (val) => {
    if (!arguments.length) return _content;
    _content = val;
    return disclosure;
  };


  return utilRebind(disclosure, dispatch, 'on');
}
