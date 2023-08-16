import debounce from 'lodash-es/debounce';

import React from 'react';
import ReactDom from 'react-dom';
import ReactComponent from './ReactComponent';
import { uiSection } from '../section';


export function uiSectionReactContainer(context) {
  let reRenderCount = 0;

  const section = uiSection('react-container', context)
    .label('A React Component')
    .disclosureContent(content);

  const chooseBackground = (source) => {
    context.systems.imagery.baseLayerSource(source);
  };

  const content = (selection) => {
    const sources = context.systems.imagery
      .sources(context.systems.map.extent(), context.systems.map.zoom())
      .filter(d => !d.isHidden() && !d.overlay);

    selection
      .append('div')
      .attr('id', 'react-component');

    ReactDom.render(
      <ReactComponent reRenderCount={reRenderCount} sources={sources} selectSourceHandler={chooseBackground}/>,
      document.getElementById('react-component')
    );
  };


  context.systems.map
    .on('draw', debounce(() => {
        reRenderCount++;
        window.requestIdleCallback(section.reRender);
      }, 1000)
    );

  return section;
}