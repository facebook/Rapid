import { uiTooltip } from '../tooltip.js';
import { uiSection } from '../section.js';


export function uiSectionMapStyleOptions(context) {
  const l10n = context.systems.l10n;
  const map = context.systems.map;

  const section = uiSection(context, 'fill-area')
    .label(l10n.t('map_data.style_options'))
    .disclosureContent(renderDisclosureContent);


  function renderDisclosureContent(selection) {
    let container = selection.selectAll('.layer-fill-list')
      .data([0]);

    container.enter()
      .append('ul')
      .attr('class', 'layer-list layer-fill-list')
      .merge(container)
      .call(drawListItems, map.areaFillOptions, 'radio', 'area_fill', setFill, isActiveFill);

    let container2 = selection.selectAll('.layer-visual-diff-list')
      .data([0]);

    container2.enter()
      .append('ul')
      .attr('class', 'layer-list layer-visual-diff-list')
      .merge(container2)
      .call(drawListItems, ['highlight_edits'], 'checkbox', 'visual_diff', setHighlighted, isHighlightChecked);
  }


  function drawListItems(selection, data, type, name, change, active) {
    let items = selection.selectAll('li')
      .data(data);

    // Exit
    items.exit()
      .remove();

    // Enter
    let enter = items.enter()
      .append('li')
      .call(uiTooltip(context)
        .title(d => l10n.t(`${name}.${d}.tooltip`))
        .shortcut(d => {
          if (d === 'wireframe') return l10n.t('shortcuts.command.wireframe.key');
          if (d === 'highlight_edits') return l10n.t('shortcuts.command.highlight_edits.key');
          return null;
        })
        .placement('top')
      );

    let label = enter
      .append('label');

    label
      .append('input')
      .attr('type', type)
      .attr('name', name)
      .on('change', change);

    label
      .append('span')
      .text(d => l10n.t(`${name}.${d}.description`));

    // Update
    items = items
      .merge(enter);

    items
      .classed('active', active)
      .selectAll('input')
      .property('checked', active)
      .property('indeterminate', false);
  }


  function isActiveFill(d) {
    return map.areaFillMode === d;
  }

  function setFill(d3_event, d) {
    map.areaFillMode = d;
  }

  function isHighlightChecked() {
    return map.highlightEdits;
  }

  function setHighlighted(d3_event) {
    const input = d3_event.currentTarget;
    map.highlightEdits = input.checked;
  }


  map.off('mapchange', section.reRender);
  map.on('mapchange', section.reRender);

  return section;
}
