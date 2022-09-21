import React from 'react';
import ReactDom from 'react-dom';
import { uiSection } from '../section';
import ReactComponent from './ReactComponent';
import _debounce from 'lodash-es/debounce';

export function uiSectionReactContainer(context) {
  let reRenderCount = 0;

  const chooseBackground = (source) => {
    context.background().baseLayerSource(source);
    document.activeElement.blur();
  };

  const content = (selection) => {
    const sources = context.background()
      .sources(context.map().extent(), context.map().zoom(), true)
      .filter(d => !d.isHidden() && !d.overlay);

    selection
      .append('div')
      .attr('id', 'react-component');

    ReactDom.render(
      <ReactComponent reRenderCount={reRenderCount} sources={sources} selectSourceHandler={chooseBackground}/>,
      document.getElementById('react-component')
    );
  };

  const section = uiSection('react-container', context)
    .label('A React Component')
    .disclosureContent(content);

  context.map()
    .on('draw', _debounce(() => {
        reRenderCount++;
        window.requestIdleCallback(section.reRender);
      }, 1000)
    );

  return section;
}
