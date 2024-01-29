import { uiModal } from './modal.js';


export function uiConfirm(context, selection) {
  const l10n = context.systems.l10n;
  let modalSelection = uiModal(selection);

  modalSelection.select('.modal')
    .classed('modal-alert', true);

  let section = modalSelection.select('.content');

  section.append('div')
    .attr('class', 'modal-section header');

  section.append('div')
    .attr('class', 'modal-section message-text');

  let buttons = section.append('div')
    .attr('class', 'modal-section buttons cf');


  modalSelection.okButton = function() {
    buttons
      .append('button')
      .attr('class', 'button ok-button action')
      .on('click.confirm', () => modalSelection.remove())
      .text(l10n.t('confirm.okay'))
      .node()
      .focus();

    return modalSelection;
  };


  return modalSelection;
}
