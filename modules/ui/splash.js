import { marked } from 'marked';

import { icon } from './intro/helper.js';
import { uiIntro } from './intro/intro.js';
import { uiModal } from './modal.js';


/**
 * uiRapidSplash
 * This is the screen we show to the users if:
 *   - They have never used Rapid before, or
 *   - We have an updated privacy policy to tell them about
 */
export function uiSplash(context) {
  const assets = context.systems.assets;
  const l10n = context.systems.l10n;
  const storage = context.systems.storage;

  const sawPrivacyVersion = parseInt(storage.getItem('sawPrivacyVersion'), 10) || 0;


  return function render(selection) {
    storage.setItem('sawPrivacyVersion', context.privacyVersion);

    // prefetch intro graph data now, while user is looking at the splash screen
    assets.loadAssetAsync('intro_graph');

    const modal = uiModal(selection);
    modal.select('.modal')
      .attr('class', 'modal rapid-modal modal-splash');

    const content = modal.select('.content');
    content
      .append('div')
      .attr('class', 'modal-section')
      .append('h2')
      .html(l10n.t('splash.welcome', { rapidicon: icon('#rapid-logo-rapid-wordmark', 'pre-text rapid') }));


    let markdown = l10n.t('splash.text', { version: context.version }) + '\n\n';

    // If they have seen some privacy version, but not the current one,
    // prepend with "Our privacy policy has recently been updated."
    if (sawPrivacyVersion > 0) {
      markdown += l10n.t('splash.privacy_update') + ' ';
    }
    markdown += l10n.t('splash.privacy');


    content
      .append('div')
      .attr('class', 'modal-section')
      .html(marked.parse(markdown));

    // outbound links should open in new tab
    content.selectAll('a')
      .attr('target', '_blank');


    const buttonWrap = content
      .append('div')
      .attr('class', 'modal-actions');

    const walkthrough = buttonWrap
      .append('button')
      .attr('class', 'walkthrough')
      .on('click', () => {
        context.container().call(uiIntro(context));
        modal.close();
      });

    walkthrough
      .append('svg')
      .attr('class', 'logo logo-walkthrough')
      .append('use')
      .attr('xlink:href', '#rapid-logo-walkthrough');

    walkthrough
      .append('div')
      .text(l10n.t('splash.walkthrough'));

    const startEditing = buttonWrap
      .append('button')
      .attr('class', 'start-editing')
      .on('click', modal.close);

    startEditing
      .append('svg')
      .attr('class', 'logo logo-features')
      .append('use')
      .attr('xlink:href', '#rapid-logo-features');

    startEditing
      .append('div')
      .text(l10n.t('splash.start'));
  };
}
