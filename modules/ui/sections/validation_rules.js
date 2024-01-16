import { select as d3_select } from 'd3-selection';

import { uiTooltip } from '../tooltip.js';
import { uiSection } from '../section.js';
import { utilGetSetValue, utilNoAuto } from '../../util/index.js';


export function uiSectionValidationRules(context) {
  const l10n = context.systems.l10n;
  const storage = context.systems.storage;
  const validator = context.systems.validator;

  const MINSQUARE = 0;
  const MAXSQUARE = 20;
  const DEFAULTSQUARE = 5;  // see also unsquare_way.js

  const section = uiSection(context, 'issues-rules')
    .disclosureContent(renderDisclosureContent)
    .label(l10n.t('issues.rules.title'));


  let _ruleKeys = validator.getRuleKeys()
    .sort((key1, key2) => {
      // alphabetize by localized title
      return l10n.t(`issues.${key1}.title`) < l10n.t(`issues.${key2}.title`) ? -1 : 1;
    });


  function renderDisclosureContent(selection) {
    let container = selection.selectAll('.issues-rulelist-container')
      .data([0]);

    let containerEnter = container.enter()
      .append('div')
      .attr('class', 'issues-rulelist-container');

    containerEnter
      .append('ul')
      .attr('class', 'layer-list issue-rules-list');

    let ruleLinks = containerEnter
      .append('div')
      .attr('class', 'issue-rules-links section-footer');

    ruleLinks
      .append('a')
      .attr('class', 'issue-rules-link')
      .attr('href', '#')
      .text(l10n.t('issues.disable_all'))
      .on('click', d3_event => {
        d3_event.preventDefault();
        validator.disableRules(_ruleKeys);
      });

    ruleLinks
      .append('a')
      .attr('class', 'issue-rules-link')
      .attr('href', '#')
      .text(l10n.t('issues.enable_all'))
      .on('click', d3_event => {
        d3_event.preventDefault();
        validator.disableRules([]);
      });

    // Update
    container = container
      .merge(containerEnter);

    container.selectAll('.issue-rules-list')
      .call(drawListItems);
  }


  function drawListItems(selection) {
    let items = selection.selectAll('li')
      .data(_ruleKeys);

    // Exit
    items.exit()
      .remove();

    // Enter
    let enter = items.enter()
      .append('li')
      .call(uiTooltip(context)
        .title(d => l10n.t(`issues.${d}.tip`))
        .placement('top')
      );

    let label = enter
      .append('label');

    label
      .append('input')
      .attr('type', 'checkbox')
      .attr('name', 'rule')
      .on('change', toggleRule);

    label
      .append('span')
      .html(d => {
        let params = {};
        if (d === 'unsquare_way') {
          params.val = '<span class="square-degrees"></span>';
        }
        return l10n.tHtml(`issues.${d}.title`, params);
      });

    // Update
    items = items
      .merge(enter);

    items
      .classed('active', isRuleEnabled)
      .selectAll('input')
      .property('checked', isRuleEnabled)
      .property('indeterminate', false);


    // user-configurable square threshold
    let degStr = storage.getItem('validate-square-degrees');
    if (degStr === null) {
      degStr = DEFAULTSQUARE.toString();
    }

    let span = items.selectAll('.square-degrees');
    let input = span.selectAll('.square-degrees-input')
      .data([0]);

    // enter / update
    input.enter()
      .append('input')
      .attr('type', 'number')
      .attr('min', MINSQUARE.toString())
      .attr('max', MAXSQUARE.toString())
      .attr('step', '0.5')
      .attr('class', 'square-degrees-input')
      .call(utilNoAuto)
      .on('click', function (d3_event) {
        d3_event.preventDefault();
        d3_event.stopPropagation();
        this.select();
      })
      .on('keyup', function (d3_event) {
        if (d3_event.keyCode === 13) { // ↩ Return
          this.blur();
          this.select();
        }
      })
      .on('blur', changeSquare)
      .merge(input)
      .property('value', degStr);
  }


  function changeSquare() {
    const input = d3_select(this);
    let degStr = utilGetSetValue(input).trim();
    let degNum = parseFloat(degStr, 10);

    if (!isFinite(degNum)) {
      degNum = DEFAULTSQUARE;
    } else if (degNum > MAXSQUARE) {
      degNum = MAXSQUARE;
    } else if (degNum < MINSQUARE) {
      degNum = MINSQUARE;
    }

    degNum = Math.round(degNum * 10 ) / 10;   // round to 1 decimal
    degStr = degNum.toString();

    input
      .property('value', degStr);

    storage.setItem('validate-square-degrees', degStr);
    validator.revalidateUnsquare();
  }

  function isRuleEnabled(d) {
    return validator.isRuleEnabled(d);
  }

  function toggleRule(d3_event, d) {
    validator.toggleRule(d);
  }


  validator.on('validated', () => {
    window.requestIdleCallback(section.reRender);
  });

  return section;
}
