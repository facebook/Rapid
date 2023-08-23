import { dispatch as d3_dispatch } from 'd3-dispatch';
import { marked } from 'marked';

import { uiConfirm } from '../confirm';
import { utilNoAuto, utilRebind } from '../../util';


export function uiSettingsCustomData(context) {
  const storage = context.systems.storage;
  const urlhash = context.systems.urlhash;
  const dispatch = d3_dispatch('change');
  const prefix = 'settings.custom_data';  // prefix for text strings

  const accept = [
    '.gpx', 'application/gpx', 'application/gpx+xml',
    '.kml', 'application/vnd.google-earth.kml+xml', 'application/kml', 'application/kml+xml',
    '.geojson', '.json', 'application/geo+json', 'application/json', 'application/vnd.geo+json', 'text/x-json'
  ];

  function render(selection) {
    const dataLayer = context.scene().layers.get('custom-data');

    // Keep separate copies of original and current settings
    // Take initial values from urlhash first, localstorage second
    const origUrl = urlhash.getParam('data') || urlhash.getParam('gpx') || storage.getItem('settings-custom-data-url');
    const origFileList = (dataLayer && dataLayer.getFileList()) || null;
    let _currUrl = origUrl;
    let _currFileList = origFileList;

    const modal = uiConfirm(context, selection).okButton();

    modal
      .classed('settings-modal settings-custom-data', true);

    modal.select('.modal-section.header')
      .append('h3')
      .html(context.tHtml('settings.custom_data.header'));


    const textSection = modal.select('.modal-section.message-text');

    const data_instructions = context.t(`${prefix}.instructions`);
    const file_heading = context.t(`${prefix}.file.heading`);
    const file_instructions = context.t(`${prefix}.file.instructions`);
    const file_types = context.t(`${prefix}.file.types`);
    const file_tip = context.t(`${prefix}.file.tip`);

    const fileHtml = marked.parse(`
${data_instructions}
&nbsp;<br>
&nbsp;<br>
### ${file_heading}
${file_instructions}
* ${file_types}
&nbsp;<br>
&nbsp;<br>
${file_tip}
`);

    textSection
      .append('div')
      .attr('class', 'instructions-template')
      .html(fileHtml);

    textSection
      .append('input')
      .attr('class', 'field-file')
      .attr('type', 'file')
      .attr('accept', accept.join())
      .property('files', _currFileList)  // works for all except IE11
      .on('change', d3_event => {
        const files = d3_event.target.files;
        if (files?.length) {
          _currFileList = files;
          _currUrl = '';
          textSection.select('.field-url').property('value', '');
        } else {
          _currFileList = null;
        }
      });

    const data_or = context.t(`${prefix}.or`);
    const url_heading = context.t(`${prefix}.url.heading`);
    const url_instructions = context.t(`${prefix}.url.instructions`);
    const url_tokens = context.t(`${prefix}.url.tokens`);
    const url_xyz = context.t(`${prefix}.url.xyz`);
    const url_example_file = context.t(`${prefix}.url.example_file`);
    const url_example_xyz = context.t(`${prefix}.url.example_xyz`);
    const url_example_pmtiles = context.t(`${prefix}.url.example_pmtiles`);
    const example = context.t('example');

    const urlHtml = marked.parse(`
### ${data_or}
### ${url_heading}
${url_instructions}
&nbsp;<br>
&nbsp;<br>
${url_tokens}
* ${url_xyz}
&nbsp;<br>
&nbsp;<br>
#### ${example}
* \`${url_example_file}\`
* \`${url_example_xyz}\`
* \`${url_example_pmtiles}\`
`);

    textSection
      .append('div')
      .attr('class', 'instructions-template')
      .html(urlHtml);

    textSection
      .append('textarea')
      .attr('class', 'field-url')
      .attr('placeholder', context.t('settings.custom_data.url.placeholder'))
      .call(utilNoAuto)
      .property('value', _currUrl);


    // Setup Ok/Cancel buttons
    const buttonSection = modal.select('.modal-section.buttons');

    buttonSection
      .insert('button', '.ok-button')
      .attr('class', 'button cancel-button secondary-action')
      .html(context.tHtml('confirm.cancel'));

    buttonSection.select('.cancel-button')
      .on('click.cancel', clickCancel);

    buttonSection.select('.ok-button')
      .attr('disabled', isSaveDisabled)
      .on('click.save', clickSave);


    function isSaveDisabled() {  // why is this here?
      return null;
    }


    // Restore the original settings
    function clickCancel() {
      textSection.select('.field-url').property('value', origUrl);
      storage.setItem('settings-custom-data-url', origUrl);
      this.blur();
      modal.close();
    }


    // Accept the current settings
    function clickSave() {
      _currUrl = textSection.select('.field-url').property('value').trim();

      let currSettings = {};

      // One or the other but not both
      if (_currUrl) {
        currSettings = { url: _currUrl, fileList: null };
        storage.setItem('settings-custom-data-url', _currUrl);
      } else if (_currFileList)  {
        currSettings = { url: null, fileList: _currFileList };
      }

      this.blur();
      modal.close();
      dispatch.call('change', this, currSettings);
    }
  }

  return utilRebind(render, dispatch, 'on');
}
