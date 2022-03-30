import { t } from '../core/localizer';
import { icon } from './intro/helper';
import { uiModal } from './modal';
import { prefs } from '../core/preferences';
import marked from 'marked';


export function uiRapidWhatsNew(context) {
  let _dontShowAgain = false;


  return function(selection) {
    if (prefs('sawWhatsNewGL') === 'true') return;

    const modalSelection = uiModal(selection);

    modalSelection.select('.modal')
      .attr('class', 'modal rapid-modal modal-splash modal-whatsnew');   // RapiD styling

    let whatsNewModal = modalSelection.select('.content');

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
      .attr('src', context.asset('img/tucson_icon_logo.png'));

    body.select('p a')
      .attr('target', '_blank');


    let checkboxContainer = whatsNewModal
      .append('div')
      .attr('class', 'modal-section rapid-checkbox dontshow')
      .attr('id', 'dontshowagain');

    let checkbox = checkboxContainer
      .append('label')
      .attr('class', 'rapid-checkbox-label dontshow');

    checkbox
      .append('span')
      .attr('class', 'rapid-checkbox-text')
      .text(t('rapid_whats_new.dontshowagain'));

    checkbox
      .append('input')
      .attr('type', 'checkbox')
      .attr('class', 'rapid-feature-checkbox')
      .property('checked', false)
      .on('click', () => {
        _dontShowAgain = !_dontShowAgain;
      });

    checkbox
      .append('div')
      .attr('class', 'rapid-checkbox-custom');

    let buttonWrap = whatsNewModal
    .append('div')
    .attr('class', 'modal-actions');

    // let nothanks = buttonWrap
    //   .append('button')
    //   .attr('class', 'whats-new-nothanks')
    //   .on('click', () => {
    //     prefs('sawWhatsNewGL', _dontShowAgain);
    //     modalSelection.close();
    //   });

    // nothanks
    //   .append('div')
    //   .text(t('rapid_whats_new.nope'));

    let okayButton = buttonWrap
      .append('button')
      .attr('class', 'whats-new-okay');

    okayButton
      .append('div')
      .text(t('rapid_whats_new.ok'))
      .on('click', () => {
        prefs('sawWhatsNewGL', _dontShowAgain);
        modalSelection.close();
      });

    modalSelection.select('button.close')
      .attr('class','hide');
  };
}
