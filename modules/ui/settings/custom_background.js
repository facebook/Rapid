import { dispatch as d3_dispatch } from 'd3-dispatch';
import { marked } from 'marked';

import { uiConfirm } from '../confirm.js';
import { utilNoAuto, utilRebind } from '../../util/index.js';


export function uiSettingsCustomBackground(context) {
  const l10n = context.systems.l10n;
  const storage = context.systems.storage;
  const dispatch = d3_dispatch('change');


  function render(selection) {
    // keep separate copies of original and current settings
    let _origSettings = { template: storage.getItem('background-custom-template') };
    let _currSettings = Object.assign({}, _origSettings);

    let modal = uiConfirm(context, selection).okButton();

    modal
      .classed('settings-modal settings-custom-background', true);

    modal.select('.modal-section.header')
      .append('h3')
      .html(l10n.tHtml('settings.custom_background.header'));

    const prefix = 'settings.custom_background.instructions';
    const info = l10n.t(`${prefix}.info`);
    const wms_label = l10n.t(`${prefix}.wms.tokens_label`);
    const wms_proj = l10n.t(`${prefix}.wms.tokens.proj`);
    const wms_wkid = l10n.t(`${prefix}.wms.tokens.wkid`);
    const wms_dims = l10n.t(`${prefix}.wms.tokens.dimensions`);
    const wms_bbox = l10n.t(`${prefix}.wms.tokens.bbox`);
    const tms_label = l10n.t(`${prefix}.tms.tokens_label`);
    const tms_xyz = l10n.t(`${prefix}.tms.tokens.xyz`);
    const tms_flip = l10n.t(`${prefix}.tms.tokens.flipped_y`);
    const tms_switch = l10n.t(`${prefix}.tms.tokens.switch`);
    const tms_quad = l10n.t(`${prefix}.tms.tokens.quadtile`);
    const tms_scale = l10n.t(`${prefix}.tms.tokens.scale_factor`);
    const example = l10n.t('example');

    const instructions = marked.parse(`
${info}
&nbsp;<br>
&nbsp;<br>
#### ${wms_label}
* ${wms_proj}
* ${wms_wkid}
* ${wms_dims}
* ${wms_bbox}
&nbsp;<br>
&nbsp;<br>
#### ${tms_label}
* ${tms_xyz}
* ${tms_flip}
* ${tms_switch}
* ${tms_quad}
* ${tms_scale}
&nbsp;<br>
&nbsp;<br>
#### ${example}
* \`https://{switch:a,b,c}.tile.openstreetmap.org/{zoom}/{x}/{y}.png\`
`);


    let textSection = modal.select('.modal-section.message-text');

    textSection
      .append('div')
      .attr('class', 'instructions-template')
      .html(instructions);

    textSection
      .append('textarea')
      .attr('class', 'field-template')
      .attr('placeholder', l10n.t('settings.custom_background.template.placeholder'))
      .call(utilNoAuto)
      .property('value', _currSettings.template);


    // insert a cancel button
    let buttonSection = modal.select('.modal-section.buttons');

    buttonSection
      .insert('button', '.ok-button')
      .attr('class', 'button cancel-button secondary-action')
      .html(l10n.tHtml('confirm.cancel'));

    buttonSection.select('.cancel-button')
      .on('click.cancel', _clickCancel);

    buttonSection.select('.ok-button')
      .on('click.save', _clickSave);


    // restore the original template
    function _clickCancel() {
      textSection.select('.field-template').property('value', _origSettings.template);
      storage.setItem('background-custom-template', _origSettings.template);
      this.blur();
      modal.close();
    }

    // accept the current template
    function _clickSave() {
      _currSettings.template = textSection.select('.field-template').property('value');
      storage.setItem('background-custom-template', _currSettings.template);
      this.blur();
      modal.close();
      dispatch.call('change', this, _currSettings);
    }
  }

  return utilRebind(render, dispatch, 'on');
}
