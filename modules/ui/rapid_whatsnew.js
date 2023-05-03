import { t } from '../core/localizer';
import { icon } from './intro/helper';
import { uiModal } from './modal';
import { marked } from 'marked';


export function uiRapidWhatsNew(context) {
  // If user has not seen this version of the what's new screen, show it again.
  // Just bump the version to a higher number to get it to come back.
  const currWhatsNewVersion = 20230323;
  let _dontShowAgain = false;

  return function render(selection) {
    const prefs = context.storageSystem();
    const sawWhatsNewVersion = parseInt(prefs.getItem('sawWhatsNewVersion'), 10) || 0;
    if (sawWhatsNewVersion === currWhatsNewVersion) return;

    const modalSelection = uiModal(selection);

    modalSelection.select('.modal')
      .attr('class', 'modal rapid-modal modal-splash modal-whatsnew');   // Rapid styling

    let whatsNewModal = modalSelection.select('.content');
    whatsNewModal
      .append('div')
      .attr('class', 'modal-section')
      .append('h2')
      .html(t('rapid_whats_new.welcome', { rapidicon: icon('#rapid-logo-rapid-wordmark', 'pre-text rapid') }));

    let body = whatsNewModal
      .append('div')
      .attr('class', 'modal-section body')
      .html(marked.parse(t('rapid_whats_new.text', {
        rapidicon: icon('#rapid-logo-rapid-wordmark', 'pre-text rapid'),
        bugicon: icon('#rapid-icon-bug', 'bugnub')
      })));

    let imageSection = body
      .append('div')
      .attr('class', 'whatsnew-images');

    imageSection
      .append('img')
      .attr('class', 'whatsnew-image')
      .attr('src', context.asset('img/rapid-v2-splash.jpg'));

//    imageSection
//      .append('img')
//      .attr('class', 'whatsnew-image')
//      .attr('src', context.asset('img/foss4g-sotm-oceania-2021_logo_reverse-colour.webp'));

    body.selectAll('p a')
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
      .property('checked', _dontShowAgain)
      .on('click', e => {
        _dontShowAgain = e.target.checked;
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
    //   .on('click', () => {});

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
        if (_dontShowAgain) {
          prefs.setItem('sawWhatsNewVersion', currWhatsNewVersion);
        }
        modalSelection.close();
      });

//    modalSelection.select('button.close')
//      .attr('class', 'hide');
  };
}
