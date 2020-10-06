import { t } from '../core/localizer';
import { icon } from './intro/helper';
import { uiModal } from './modal';
import { prefs } from '../core/preferences';
import marked from 'marked';


export function uiRapidWhatsNew(context) {
  let _dontShowAgain = false;

  function handleClick() {
    _dontShowAgain = !_dontShowAgain;
  }

  return function(selection) {
    if (prefs('sawWhatsNew') === 'true') return;

    const modalSelection = uiModal(selection);


    modalSelection.select('.modal')
      .attr('class', 'modal modal-splash modal-rapid modal-whatsnew');

    let whatsNewModal = modalSelection.select('.content')
      .append('div')
      .attr('class', 'fillL');

    whatsNewModal
      .append('div')
      .attr('class','modal-section')
      .append('h3')
      .html(t('rapid_whats_new.welcome', { rapidicon: icon('#iD-logo-rapid', 'logo-rapid') }));


    let body = whatsNewModal
      .append('div')
      .attr('class','modal-section body')
      .html(marked(t('rapid_whats_new.text', {rapidicon: icon('#iD-logo-rapid', 'logo-rapid') })));


    body
      .append('img')
      .attr('class', 'whatsnew-image')
      .attr('src', context.asset('img/rapid-esri-splash.jpg'));

    body.select('p a')
      .attr('target', '_blank');


    let checkboxContainer = whatsNewModal
      .append('div')
      .attr('class', 'modal-section rapid-checkbox dontshow')
      .attr('id', 'dontshowagain');

    let checkbox = checkboxContainer
      .append('label')
      .attr('class', 'rapid-checkbox-label dontshow')
      .html(t('rapid_whats_new.dontshowagain'));

    checkbox
      .append('input')
      .attr('type', 'checkbox')
      .attr('class', 'rapid-feature-checkbox')
      .property('checked', false)
      .on('click', handleClick);

    checkbox
      .append('div')
      .attr('class', 'rapid-checkbox-custom');

    let buttonWrap = whatsNewModal
    .append('div')
    .attr('class', 'modal-actions');

    let nothanks = buttonWrap
      .append('button')
      .on('click', () => {
        prefs('sawWhatsNew', _dontShowAgain);
        modalSelection.close();
      });

    nothanks
      .append('div')
      .text(t('rapid_whats_new.nope'));

    let okayButton = buttonWrap
      .append('button')
      .attr('class', 'whats-new-okay');

    okayButton
      .append('div')
      .text(t('rapid_whats_new.ok'))
      .on('click', () => {
        prefs('sawWhatsNew', _dontShowAgain);
        modalSelection.close();
        window.open('https://mapwith.ai/rapid-esri', '_blank');
      });

    modalSelection.select('button.close')
      .attr('class','hide');
  };
}
