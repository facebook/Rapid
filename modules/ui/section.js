import { select as d3_select } from 'd3-selection';

import { uiDisclosure } from './disclosure.js';
import { utilFunctor } from '../util/index.js';


// A Section is a box of content.
//
// Use .content() to render the content by itself
// or  .disclosureContent() to render the content inside a Disclosure (toggle with heading)
//
export function uiSection(context, sectionID) {
  let _classes = utilFunctor('');
  let _container = d3_select(null);

  let _shouldDisplay;
  let _content;
  let _disclosure;
  let _label;
  let _disclosureContent;
  let _disclosureExpandOverride;

  let section = {
    id: sectionID
  };

  section.selection = function() {
    return _container;
  };

  section.classes = function(val) {
    if (!arguments.length) return _classes;
    _classes = utilFunctor(val);
    return section;
  };

  section.label = function(val) {
    if (!arguments.length) return _label;
    _label = utilFunctor(val);
    return section;
  };

  section.shouldDisplay = function(val) {
    if (!arguments.length) return _shouldDisplay;
    _shouldDisplay = utilFunctor(val);
    return section;
  };

  section.content = function(val) {
    if (!arguments.length) return _content;
    _content = val;
    return section;
  };

  section.disclosureContent = function(val) {
    if (!arguments.length) return _disclosureContent;
    _disclosureContent = val;
    return section;
  };

  section.disclosureExpandOverride = function(val) {
    if (!arguments.length) return _disclosureExpandOverride;
    _disclosureExpandOverride = val;
    return section;
  };


  section.render = function render(selection) {
    _container = selection
      .selectAll(`.section-${sectionID}`)
      .data([0]);

    const containerEnter = _container
      .enter()
      .append('div')
      .attr('class', `section section-${sectionID} ` + (_classes && _classes() || ''));

    _container = containerEnter
      .merge(_container);

    _container
      .call(renderContent);
  };


  section.reRender = function() {
    _container
      .call(renderContent);
  };



  function renderContent(selection) {
    // The section may be hidden completely if it isn't needed.
    // If there is a _shouldDisplay() function, we call it to determine this.
    if (typeof _shouldDisplay === 'function') {
      const shouldDisplay = _shouldDisplay();
      selection.classed('hide', !shouldDisplay);
      if (!shouldDisplay) {
        selection.html('');
        return;
      }
    }

    // Render the content inside a Disclosure
    if (_disclosureContent) {
      if (!_disclosure) {   // create if needed
        _disclosure = uiDisclosure(context, sectionID.replace(/-/g, '_'))
          .label(_label || '')
          .content(_disclosureContent);
      }

      _disclosure
        .expandOverride(_disclosureExpandOverride);

      selection
        .call(_disclosure);

    // Render the content on its own
    } else if (_content) {
      selection
        .call(_content);
    }
  }

  return section;
}
