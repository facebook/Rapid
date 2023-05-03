import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { utilGetSetValue, utilNoAuto } from '../../util';
import { uiTooltip } from '../tooltip';
import { uiSection } from '../section';


export function uiSectionValidationRules(context) {
  const MINSQUARE = 0;
  const MAXSQUARE = 20;
  const DEFAULTSQUARE = 5;  // see also unsquare_way.js

  const prefs = context.storageSystem();
  const section = uiSection('issues-rules', context)
    .disclosureContent(renderDisclosureContent)
    .label(t.html('issues.rules.title'));


  let _ruleKeys = context.validator().getRuleKeys()
    .filter(key => key !== 'maprules')
    .sort((key1, key2) => {
      // alphabetize by localized title
      return t(`issues.${key1}.title`) < t(`issues.${key2}.title`) ? -1 : 1;
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
      .html(t.html('issues.disable_all'))
      .on('click', d3_event => {
        d3_event.preventDefault();
        context.validator().disableRules(_ruleKeys);
      });

    ruleLinks
      .append('a')
      .attr('class', 'issue-rules-link')
      .attr('href', '#')
      .html(t.html('issues.enable_all'))
      .on('click', d3_event => {
        d3_event.preventDefault();
        context.validator().disableRules([]);
      });

    // Update
    container = container
      .merge(containerEnter);

    container.selectAll('.issue-rules-list')
      .call(drawListItems, _ruleKeys, 'checkbox', 'rule', toggleRule, isRuleEnabled);
  }


  function drawListItems(selection, data, type, name, change, active) {
    let items = selection.selectAll('li')
      .data(data);

    // Exit
    items.exit()
      .remove();

    // Enter
    let enter = items.enter()
      .append('li');

    if (name === 'rule') {
      enter
        .call(uiTooltip()
          .title(d => t.html(`issues.${d}.tip`))
          .placement('top')
        );
    }

    let label = enter
      .append('label');

    label
      .append('input')
      .attr('type', type)
      .attr('name', name)
      .on('change', change);

    label
      .append('span')
      .html(d => {
        let params = {};
        if (d === 'unsquare_way') {
          params.val = '<span class="square-degrees"></span>';
        }
        return t.html(`issues.${d}.title`, params);
      });

    // Update
    items = items
      .merge(enter);

    items
      .classed('active', active)
      .selectAll('input')
      .property('checked', active)
      .property('indeterminate', false);


    // user-configurable square threshold
    let degStr = prefs.getItem('validate-square-degrees');
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

    prefs.setItem('validate-square-degrees', degStr);
    context.validator().revalidateUnsquare();
  }

  function isRuleEnabled(d) {
    return context.validator().isRuleEnabled(d);
  }

  function toggleRule(d3_event, d) {
    context.validator().toggleRule(d);
  }


  context.validator().on(`validated.uiSectionValidationRules`, () => {
    window.requestIdleCallback(section.reRender);
  });

  return section;
}
