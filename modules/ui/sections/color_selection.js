import { uiTooltip } from '../tooltip.js';
import { uiCombobox } from '../combobox.js';
import { uiSection } from '../section.js';
import { utilNoAuto } from '../../util/index.js';
import { uiCmd } from '../index.js';

export function uiSectionColorSelection(context) {
  const l10n = context.systems.l10n;
  const styles = context.systems.styles;

  // Add or replace event handlers
  styles.off('colorsloaded', loadComboBoxData);
  styles.on('colorsloaded', loadComboBoxData);

  let comboData = [];

  function loadComboBoxData(){
    let colorSchemeKeys = Object.keys(styles.getAllColorSchemes());

    for (let i = 0; i < colorSchemeKeys.length; i++) {
      let colorObject = {};
      let colorSchemeTitle = colorSchemeKeys[i];
      colorObject.title = colorSchemeTitle;
      colorObject.value = l10n.t(`preferences.color_selection.${colorSchemeTitle}`);
      comboData.push(colorObject);
    }
    return comboData;
  }

  const section = uiSection(context, 'preferences-color-selection')
    .label(l10n.t('preferences.color_selection.title'))
    .disclosureContent(renderDisclosureContent);

  const colorCombo = uiCombobox(context, 'color-selection');

  let _colorSelectedId = null;
  let _checkboxState = false;

  function renderDisclosureContent(selection) {
    // enter
    let colorOptionsListEnter = selection.selectAll('.preferences-color-selection-list')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'layer-list preferences-color-selection-list')
      .call(uiTooltip(context)
        .title(l10n.tHtml('preferences.color_selection.tooltip')));


    let pickerCombo = colorOptionsListEnter.append('div');

    pickerCombo.append('input')
      .attr('class', 'color-select')
      .attr('placeholder', l10n.t('preferences.color_selection.placeholder'))
      .call(utilNoAuto)
      .call(colorCombo)
      .on('blur change', d3_event => updateColorScheme(d3_event) );

    colorCombo.data(comboData);

    update(selection);

  }

  function update(selection) {
    selection.selectAll('.preferences-color-selection-item')
      .classed('active', (_checkboxState === 'true'))
      .select('input')
      .property('checked', (_checkboxState === 'true'));
  }

  function getColorSchemeName(val) {
    for (let i = 0; i < comboData.length; i++) {
      let colorSchemeObj = comboData[i];
      if (colorSchemeObj.value === val) {
        return colorSchemeObj.title;
      }
    }
  }

  function updateColorScheme(d3_event) {
    const element = d3_event.currentTarget;
    const val = (element && element.value) || '';
    const data = colorCombo.data();
    if (data.some(item => item.value === val)) {
      _colorSelectedId = val;
      let colorSchemeName = getColorSchemeName(_colorSelectedId);

      if (styles.currentColorScheme !== colorSchemeName) {
        styles.setColorScheme(colorSchemeName);
        context.scene().dirtyScene();
        context.systems.map.deferredRedraw();
      }

    } else {
      d3_event.currentTarget.value = '';
      _colorSelectedId = null;
    }
  }

  function switchColorScheme() {
    // Get all color schemes
    const colorSchemesOrdered = ['default', 'high_contrast', 'colorblind_general', 'colorblind_ibm', 'colorblind_paul_tol_vibrant'];
    const allColorSchemes = styles.getAllColorSchemes();

    // Identify the name and index of the current color scheme
    const currentColorSchemeName = colorSchemesOrdered.find( item => allColorSchemes[item] === styles.getColorScheme() );
    const currentColorSchemeIndex = colorSchemesOrdered.findIndex( item => item === currentColorSchemeName);

    // Use the index of the current color scheme to identify the next one
    const numColorSchemes = Object.keys(styles.getAllColorSchemes()).length;
    const nextColorSchemeIndex = (currentColorSchemeIndex + 1) % numColorSchemes;
    const nextColorSchemeName = colorSchemesOrdered[nextColorSchemeIndex];

    // Update the color scheme
    styles.setColorScheme(nextColorSchemeName);
    context.scene().dirtyScene();
    context.systems.map.deferredRedraw();
  }

  context.keybinding()
    .on(uiCmd('⌥⇧' + l10n.t('preferences.color_selection.switch_color_scheme.key')), switchColorScheme);

  return section;
}
