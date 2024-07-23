import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { uiIcon } from './icon.js';
import { uiKeepRightDetails } from './keepRight_details.js';
import { uiKeepRightHeader } from './keepRight_header.js';
import { uiViewOnKeepRight } from './view_on_keepRight.js';
import { utilNoAuto, utilRebind } from '../util/index.js';


export function uiKeepRightEditor(context) {
  const l10n = context.systems.l10n;
  const keepright = context.services.keepRight;
  const dispatch = d3_dispatch('change');
  const qaDetails = uiKeepRightDetails(context);
  const qaHeader = uiKeepRightHeader(context);

  let _qaItem;


  function render(selection) {
    const headerEnter = selection.selectAll('.header')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'header fillL');

    headerEnter
      .append('button')
      .attr('class', 'close')
      .on('click', () => context.enter('browse'))
      .call(uiIcon('#rapid-icon-close'));

    headerEnter
      .append('h3')
      .text(l10n.t('QA.keepRight.title'));


    let body = selection.selectAll('.body')
      .data([0]);

    body = body.enter()
      .append('div')
      .attr('class', 'body')
      .merge(body);

    const editor = body.selectAll('.qa-editor')
      .data([0]);

    editor.enter()
      .append('div')
      .attr('class', 'modal-section qa-editor')
      .merge(editor)
      .call(qaHeader.issue(_qaItem))
      .call(qaDetails.issue(_qaItem))
      .call(keepRightSaveSection);


    const footer = selection.selectAll('.sidebar-footer')
      .data([0]);

    footer.enter()
      .append('div')
      .attr('class', 'sidebar-footer')
      .merge(footer)
      .call(uiViewOnKeepRight(context).issue(_qaItem));
  }


  function keepRightSaveSection(selection) {
    const errID = _qaItem?.id;
    const isSelected = errID && context.selectedData().has(errID);
    const isShown = (_qaItem && (isSelected || _qaItem.newComment || _qaItem.comment));
    let saveSection = selection.selectAll('.qa-save')
      .data(isShown ? [_qaItem] : [], d => d.key);

    // exit
    saveSection.exit()
      .remove();

    // enter
    const saveSectionEnter = saveSection.enter()
      .append('div')
      .attr('class', 'qa-save save-section cf');

    saveSectionEnter
      .append('h4')
      .attr('class', '.qa-save-header')
      .text(l10n.t('QA.keepRight.comment'));

    saveSectionEnter
      .append('textarea')
      .attr('class', 'new-comment-input')
      .attr('placeholder', l10n.t('QA.keepRight.comment_placeholder'))
      .attr('maxlength', 1000)
      .property('value', d => d.newComment || d.comment)
      .call(utilNoAuto)
      .on('input', changeInput)
      .on('blur', changeInput);

    // update
    saveSection = saveSectionEnter
      .merge(saveSection)
      .call(qaSaveButtons);

    function changeInput() {
      const input = d3_select(this);
      let val = input.property('value').trim();

      if (val === _qaItem.comment) {
        val = undefined;
      }

      // store the unsaved comment with the issue itself
      _qaItem = _qaItem.update({ newComment: val });

      if (keepright) {
        keepright.replaceItem(_qaItem);  // update keepright cache
      }

      saveSection
        .call(qaSaveButtons);
    }
  }


  function qaSaveButtons(selection) {
    const errID = _qaItem?.id;
    const isSelected = errID && context.selectedData().has(errID);
    let buttonSection = selection.selectAll('.buttons')
      .data(isSelected ? [_qaItem] : [], d => d.key);

    // exit
    buttonSection.exit()
      .remove();

    // enter
    const buttonEnter = buttonSection.enter()
      .append('div')
        .attr('class', 'buttons');

    buttonEnter
      .append('button')
      .attr('class', 'button comment-button action')
      .text(l10n.t('QA.keepRight.save_comment'));

    buttonEnter
      .append('button')
      .attr('class', 'button close-button action');

    buttonEnter
      .append('button')
      .attr('class', 'button ignore-button action');

    // update
    buttonSection = buttonSection
      .merge(buttonEnter);

    buttonSection.select('.comment-button')   // select and propagate data
      .attr('disabled', d => d.newComment ? null : true)
      .on('click.comment', function(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - #4641
        if (keepright) {
          keepright.postUpdate(d, (err, item) => dispatch.call('change', item));
        }
      });

    buttonSection.select('.close-button')   // select and propagate data
      .text(d => {
        const andComment = (d.newComment ? '_comment' : '');
        return l10n.t(`QA.keepRight.close${andComment}`);
      })
      .on('click.close', function(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - #4641
        if (keepright) {
          d.newStatus = 'ignore_t';   // ignore temporarily (item fixed)
          keepright.postUpdate(d, (err, item) => dispatch.call('change', item));
        }
      });

    buttonSection.select('.ignore-button')   // select and propagate data
      .text(d => {
        const andComment = (d.newComment ? '_comment' : '');
        return l10n.t(`QA.keepRight.ignore${andComment}`);
      })
      .on('click.ignore', function(d3_event, d) {
        this.blur();    // avoid keeping focus on the button - #4641
        if (keepright) {
          d.newStatus = 'ignore';   // ignore permanently (false positive)
          keepright.postUpdate(d, (err, item) => dispatch.call('change', item));
        }
      });
  }

  render.error = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return render;
  };

  return utilRebind(render, dispatch, 'on');
}
