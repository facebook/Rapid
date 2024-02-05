import * as PIXI from 'pixi.js';
import { uiTooltip } from '../tooltip.js';
import { uiCombobox } from '../combobox.js';
import { uiSection } from '../section.js';
import { utilNoAuto } from '../../util/index.js';


export function uiSectionColorblindModeOptions(context) {
  const l10n = context.systems.l10n;
  const colors = context.systems.colors;  // todo: replace

  let comboData = [{ title: 'default', value: l10n.t('preferences.colorblind_options.default') }];

  const mapDataContainer = context.scene().groups.get('basemap');

  // colorblind filters
  const protanopiaFilter = new PIXI.ColorMatrixFilter();
  const deuteranopiaFilter = new PIXI.ColorMatrixFilter();
  const tritanopiaFilter = new PIXI.ColorMatrixFilter();
  const filtersObject = { 'Protanopia': protanopiaFilter, 'Deuteranopia': deuteranopiaFilter, 'Tritanopia': tritanopiaFilter };

  // color matrices
  const protanopiaMatrix = colors.protanopiaMatrix;
  const deuteranopiaMatrix = colors.deuteranopiaMatrix;
  const tritanopiaMatrix = colors.tritanopiaMatrix;

  // apply color matrices to filters
  protanopiaFilter.matrix = protanopiaMatrix;
  deuteranopiaFilter.matrix = deuteranopiaMatrix;
  tritanopiaFilter.matrix = tritanopiaMatrix;

  function loadComboBoxData(){
    let colorblindModes = Object.keys(filtersObject);

    for (let i = 0; i < colorblindModes.length; i++) {
      let colorObject = {};
      let colorblindModeTitle = colorblindModes[i].toLowerCase();
      colorObject.title = colorblindModeTitle;
      colorObject.value = l10n.t(`preferences.colorblind_options.${colorblindModeTitle}`);
      comboData.push(colorObject);
    }
    return comboData;
  }

  loadComboBoxData();

  const section = uiSection(context, 'preferences-colorblind-mode-options')
    .label(l10n.tHtml('preferences.colorblind_options.title'))
    .disclosureContent(renderDisclosureContent);

  const colorblindCombo = uiCombobox(context, 'colorblind-mode-options');

  let _checkboxState = false;

  function renderDisclosureContent(selection) {
    // enter
    let colorOptionsListEnter = selection.selectAll('.preferences-colorblind-mode-options-list')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'layer-list preferences-colorblind-mode-options-list')
      .call(uiTooltip(context)
        .title(l10n.tHtml('preferences.colorblind_options.tooltip')));


    let pickerCombo = colorOptionsListEnter.append('div');

    pickerCombo.append('input')
      .attr('class', 'color-select')
      .attr('placeholder', l10n.t('preferences.colorblind_options.placeholder'))
      .call(utilNoAuto)
      .call(colorblindCombo)
      .on('blur change', d3_event => {
        const element = d3_event.currentTarget;
        const val = element.value;
        if (val in filtersObject && val !== 'Default') {
          let filterToApply = filtersObject[val];
          mapDataContainer.filters = [filterToApply];
          context.systems.map.immediateRedraw();
        } else {
          mapDataContainer.filters = [];
          context.systems.map.immediateRedraw();
        }
      });

    colorblindCombo.data(comboData);

    update();

    function update() {
      selection.selectAll('.preferences-colorblind-mode-options-item')
        .classed('active', (_checkboxState === 'true'))
        .select('input')
        .property('checked', (_checkboxState === 'true'));
    }
  }

  return section;
}
