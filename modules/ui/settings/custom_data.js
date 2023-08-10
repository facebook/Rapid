import { dispatch as d3_dispatch } from 'd3-dispatch';

import { uiConfirm } from '../confirm';
import { utilNoAuto, utilRebind } from '../../util';


export function uiSettingsCustomData(context) {
  const storage = context.systems.storage;
  let dispatch = d3_dispatch('change');

  const accept = [
    '.gpx', 'application/gpx', 'application/gpx+xml',
    '.kml', 'application/vnd.google-earth.kml+xml', 'application/kml', 'application/kml+xml',
    '.geojson', '.json', 'application/geo+json', 'application/json', 'application/vnd.geo+json', 'text/x-json'
  ];

  function render(selection) {
    let dataLayer = context.scene().layers.get('custom-data');

    // Keep separate copies of original and current settings
    let _origSettings = {
      fileList: (dataLayer && dataLayer.fileList()) || null,
      url: storage.getItem('settings-custom-data-url')
    };
    let _currSettings = Object.assign({}, _origSettings);


    const modal = uiConfirm(context, selection).okButton();

    modal
      .classed('settings-modal settings-custom-data', true);

    modal.select('.modal-section.header')
      .append('h3')
      .html(context.tHtml('settings.custom_data.header'));


    const textSection = modal.select('.modal-section.message-text');

    textSection
      .append('pre')
      .attr('class', 'instructions-file')
      .html(context.tHtml('settings.custom_data.file.instructions'));

    textSection
      .append('input')
      .attr('class', 'field-file')
      .attr('type', 'file')
      .attr('accept', accept.join())
      .property('files', _currSettings.fileList)  // works for all except IE11
      .on('change', d3_event => {
        const files = d3_event.target.files;
        if (files?.length) {
          _currSettings.url = '';
          textSection.select('.field-url').property('value', '');
          _currSettings.fileList = files;
        } else {
          _currSettings.fileList = null;
        }
      });

    textSection
      .append('h4')
      .html(context.tHtml('settings.custom_data.or'));

    textSection
      .append('pre')
      .attr('class', 'instructions-url')
      .html(context.tHtml('settings.custom_data.url.instructions'));

    textSection
      .append('textarea')
      .attr('class', 'field-url')
      .attr('placeholder', context.t('settings.custom_data.url.placeholder'))
      .call(utilNoAuto)
      .property('value', _currSettings.url);


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
      textSection.select('.field-url').property('value', _origSettings.url);
      storage.setItem('settings-custom-data-url', _origSettings.url);
      this.blur();
      modal.close();
    }

    // Accept the current settings
    function clickSave() {
      _currSettings.url = textSection.select('.field-url').property('value').trim();

      // One or the other but not both
      if (_currSettings.url)       { _currSettings.fileList = null; }
      if (_currSettings.fileList)  { _currSettings.url = '';        }

      storage.setItem('settings-custom-data-url', _currSettings.url);
      this.blur();
      modal.close();
      dispatch.call('change', this, _currSettings);
    }
  }

  return utilRebind(render, dispatch, 'on');
}
