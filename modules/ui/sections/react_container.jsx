import debounce from 'lodash-es/debounce.js';

import React from 'react';
import ReactDom from 'react-dom';
import ReactComponent from './ReactComponent';
import { uiSection } from '../section.js';


export function uiSectionReactContainer(context) {
  const imagery = context.systems.imagery;
  const map = context.systems.map;
  let reRenderCount = 0;

  const section = uiSection(context, 'react-container')
    .label('A React Component')
    .disclosureContent(renderContent);

  const chooseBackground = (source) => {
    imagery.baseLayerSource(source);
  };

  const renderContent = (selection) => {
    const sources = imagery
      .visibleSources()
      .filter(d => !d.overlay);

    selection
      .append('div')
      .attr('id', 'react-component');

    ReactDom.render(
      <ReactComponent reRenderCount={reRenderCount} sources={sources} selectSourceHandler={chooseBackground}/>,
      document.getElementById('react-component')
    );
  };


  map
    .on('draw', debounce(() => {
        reRenderCount++;
        window.requestIdleCallback(section.reRender);
      }, 1000)
    );

  return section;
}
