import { dispatch as d3_dispatch } from 'd3-dispatch';
import { marked } from 'marked';

import { uiConfirm } from '../confirm';
import { utilNoAuto, utilRebind } from '../../util';


export function uiSettingsCustomBackground(context) {
  const prefs = context.systems.storage;
  const dispatch = d3_dispatch('change');


  function render(selection) {
    // keep separate copies of original and current settings
    let _origSettings = { template: prefs.getItem('background-custom-template') };
    let _currSettings = Object.assign({}, _origSettings);

    let modal = uiConfirm(context, selection).okButton();

    modal
      .classed('settings-modal settings-custom-background', true);

    modal.select('.modal-section.header')
      .append('h3')
      .html(context.tHtml('settings.custom_background.header'));

    const prefix = 'settings.custom_background.instructions';
    const info = context.t(`${prefix}.info`);
    const wms_label = context.t(`${prefix}.wms.tokens_label`);
    const wms_proj = context.t(`${prefix}.wms.tokens.proj`);
    const wms_wkid = context.t(`${prefix}.wms.tokens.wkid`);
    const wms_dims = context.t(`${prefix}.wms.tokens.dimensions`);
    const wms_bbox = context.t(`${prefix}.wms.tokens.bbox`);
    const tms_label = context.t(`${prefix}.tms.tokens_label`);
    const tms_xyz = context.t(`${prefix}.tms.tokens.xyz`);
    const tms_flip = context.t(`${prefix}.tms.tokens.flipped_y`);
    const tms_switch = context.t(`${prefix}.tms.tokens.switch`);
    const tms_quad = context.t(`${prefix}.tms.tokens.quadtile`);
    const tms_scale = context.t(`${prefix}.tms.tokens.scale_factor`);
    const example = context.t(`${prefix}.example`);

    const instructions = marked.parse(`
${info}

#### ${wms_label}
* ${wms_proj}
* ${wms_wkid}
* ${wms_dims}
* ${wms_bbox}

#### ${tms_label}
* ${tms_xyz}
* ${tms_flip}
* ${tms_switch}
* ${tms_quad}
* ${tms_scale}

#### ${example}
  'https://{switch:a,b,c}.tile.openstreetmap.org/{zoom}/{x}/{y}.png'
`);


    let textSection = modal.select('.modal-section.message-text');

    textSection
      .append('div')
      .attr('class', 'instructions-template')
      .html(instructions);

    textSection
      .append('textarea')
      .attr('class', 'field-template')
      .attr('placeholder', context.t('settings.custom_background.template.placeholder'))
      .call(utilNoAuto)
      .property('value', _currSettings.template);


    // insert a cancel button
    let buttonSection = modal.select('.modal-section.buttons');

    buttonSection
      .insert('button', '.ok-button')
      .attr('class', 'button cancel-button secondary-action')
      .html(context.tHtml('confirm.cancel'));

    buttonSection.select('.cancel-button')
      .on('click.cancel', _clickCancel);

    buttonSection.select('.ok-button')
      .on('click.save', _clickSave);


    // restore the original template
    function _clickCancel() {
      textSection.select('.field-template').property('value', _origSettings.template);
      prefs.setItem('background-custom-template', _origSettings.template);
      this.blur();
      modal.close();
    }

    // accept the current template
    function _clickSave() {
      _currSettings.template = textSection.select('.field-template').property('value');
      prefs.setItem('background-custom-template', _currSettings.template);
      this.blur();
      modal.close();
      dispatch.call('change', this, _currSettings);
    }
  }

  return utilRebind(render, dispatch, 'on');
}
