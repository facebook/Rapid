import { uiModal } from './modal.js';


export function uiRestore(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;

  return function(selection) {
    if (!editor.canRestoreBackup) return;

    let modalSelection = uiModal(selection, true);

    modalSelection.select('.modal')
      .attr('class', 'modal fillL');

    let introModal = modalSelection.select('.content');

    introModal
      .append('div')
      .attr('class', 'modal-section')
      .append('h3')
      .text(l10n.t('restore.heading'));

    introModal
      .append('div')
      .attr('class','modal-section')
      .append('p')
      .text(l10n.t('restore.description'));

    let buttonWrap = introModal
      .append('div')
      .attr('class', 'modal-actions');

    let restore = buttonWrap
      .append('button')
      .attr('class', 'restore')
      .on('click', () => {
        editor.restoreBackup();
        modalSelection.remove();
      });

    restore
      .append('svg')
      .attr('class', 'logo logo-restore')
      .append('use')
      .attr('xlink:href', '#rapid-logo-restore');

    restore
      .append('div')
      .text(l10n.t('restore.restore'));

    let reset = buttonWrap
      .append('button')
      .attr('class', 'reset')
      .on('click', () => {
        editor.clearBackup();
        modalSelection.remove();
      });

    reset
      .append('svg')
      .attr('class', 'logo logo-reset')
      .append('use')
      .attr('xlink:href', '#rapid-logo-reset');

    reset
      .append('div')
      .text(l10n.t('restore.reset'));

    restore.node().focus();
  };
}
