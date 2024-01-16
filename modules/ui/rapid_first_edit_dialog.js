import { icon } from './intro/helper.js';
import { uiModal } from './modal.js';
import { uiRapidSplash } from './rapid_splash.js';


export function uiRapidFirstEditDialog(context) {
  const l10n = context.systems.l10n;

  return function(selection) {
    let modalSelection = uiModal(selection);

    modalSelection.select('.modal')
      .attr('class', 'modal rapid-modal');   // Rapid styling

    let firstEditModal = modalSelection.select('.content');

    firstEditModal
      .append('div')
      .attr('class', 'modal-section')
      .append('h3')
      .html(l10n.t('rapid_first_edit.nice', { rapidicon: icon('#rapid-logo-rapid-wordmark', 'logo-rapid') }));

    firstEditModal
      .append('div')
      .attr('class', 'modal-section')
      .append('p')
      .text(l10n.t('rapid_first_edit.text'));

    let buttonWrap = firstEditModal
      .append('div')
      .attr('class', 'modal-actions');

    let exploring = buttonWrap
      .append('button')
      .attr('class', 'rapid-explore')
      .on('click', () => {
        modalSelection.close();
      });

    exploring
      .append('div')
      .text(l10n.t('rapid_first_edit.exploring'));

    let loginToOsm = buttonWrap
      .append('button')
      .attr('class', 'rapid-login-to-osm')
      .on('click', () => {
        modalSelection.close();
        const osm = context.services.osm;
        if (!osm) return;
        osm.authenticate(() => context.container().call(uiRapidSplash(context)) );
      });

    loginToOsm
      .append('div')
      .text(l10n.t('rapid_first_edit.login_with_osm'));

    modalSelection.select('button.close')
      .attr('class', 'hide');
  };
}
