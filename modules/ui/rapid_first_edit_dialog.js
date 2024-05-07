import { icon } from './intro/helper.js';
import { uiModal } from './modal.js';
import { uiRapidSplash } from './rapid_splash.js';


export function uiRapidFirstEditDialog(context) {
  const l10n = context.systems.l10n;

  return function(selection) {
    const modal = uiModal(selection);

    modal.select('.modal')
      .attr('class', 'modal rapid-modal');

    const content = modal.select('.content');

    content
      .append('div')
      .attr('class', 'modal-section')
      .append('h3')
      .html(l10n.t('rapid_first_edit.nice', { rapidicon: icon('#rapid-logo-rapid-wordmark', 'logo-rapid') }));

    content
      .append('div')
      .attr('class', 'modal-section')
      .append('p')
      .text(l10n.t('rapid_first_edit.text'));

    const buttonWrap = content
      .append('div')
      .attr('class', 'modal-actions');

    const exploring = buttonWrap
      .append('button')
      .attr('class', 'rapid-explore')
      .on('click', modal.close);

    exploring
      .append('div')
      .text(l10n.t('rapid_first_edit.exploring'));

    const loginToOsm = buttonWrap
      .append('button')
      .attr('class', 'rapid-login-to-osm')
      .on('click', () => {
        modal.close();
        const osm = context.services.osm;
        if (!osm) return;
        osm.authenticate(() => context.container().call(uiRapidSplash(context)) );
      });

    loginToOsm
      .append('div')
      .text(l10n.t('rapid_first_edit.login_with_osm'));
  };
}
