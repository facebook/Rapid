import { uiIcon } from './icon';

import { uiDataHeader } from './data_header';
import { uiSectionRawTagEditor } from './sections/raw_tag_editor';


export function uiDataEditor(context) {
  let dataHeader = uiDataHeader(context);
  let rawTagEditor = uiSectionRawTagEditor(context, 'custom-data-tag-editor')
    .readOnlyTags([/./]);
  let _datum;


  function dataEditor(selection) {
    let header = selection.selectAll('.header')
      .data([0]);

    let headerEnter = header.enter()
      .append('div')
      .attr('class', 'header fillL');

    headerEnter
      .append('button')
      .attr('class', 'close')
      .on('click', () => context.enter('browse'))
      .call(uiIcon('#rapid-icon-close'));

    headerEnter
      .append('h3')
      .html(context.tHtml('map_data.title'));


    let body = selection.selectAll('.body')
      .data([0]);

    body = body.enter()
      .append('div')
      .attr('class', 'body')
      .merge(body);

    let editor = body.selectAll('.data-editor')
      .data([0]);

    // enter/update
    editor.enter()
      .append('div')
      .attr('class', 'modal-section data-editor')
      .merge(editor)
      .call(dataHeader.datum(_datum));

    let rte = body.selectAll('.data-tag-editor')
      .data([0]);

    // enter/update
    rte.enter()
      .append('div')
      .attr('class', 'data-tag-editor')
      .merge(rte)
      .call(rawTagEditor
        .tags((_datum && _datum.properties) || {})
        .state('hover')
        .render
      )
      .selectAll('textarea.tag-text')
      .attr('readonly', true)
      .classed('readonly', true);
  }


  dataEditor.datum = function(val) {
    if (!arguments.length) return _datum;
    _datum = val;
    return this;
  };


  return dataEditor;
}
