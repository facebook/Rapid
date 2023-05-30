import _debounce from 'lodash-es/debounce';

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
    context.imagerySystem().baseLayerSource(source);
  };

  const content = (selection) => {
    const sources = context.imagerySystem()
      .sources(context.mapSystem().extent(), context.mapSystem().zoom())
      .filter(d => !d.isHidden() && !d.overlay);

    selection
      .append('div')
      .attr('id', 'react-component');

    ReactDom.render(
      <ReactComponent reRenderCount={reRenderCount} sources={sources} selectSourceHandler={chooseBackground}/>,
      document.getElementById('react-component')
    );
  };


  context.mapSystem()
    .on('draw', _debounce(() => {
        reRenderCount++;
        window.requestIdleCallback(section.reRender);
      }, 1000)
    );

  return section;
}