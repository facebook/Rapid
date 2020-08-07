import { t } from '../core/localizer';
import { icon } from './intro/helper';
import { uiModal } from './modal';
import { prefs } from '../core/preferences';
import marked from 'marked';

export function uiWhatsNewRapid(context) {

    return function(selection) {
        if (!prefs('sawRapidSplash'))
            return;
            
        if (prefs('sawWhatsNew'))
            return;

        prefs('sawWhatsNew', true);

        var modalSelection = uiModal(selection);

        modalSelection.select('.modal')
            .attr('class', 'modal-whatsnew modal modal-rapid');

        var whatsNewModal = modalSelection.select('.content')
            .append('div')
            .attr('class', 'fillL');

        whatsNewModal
            .append('div')
            .attr('class','modal-section')
            .append('h3')
            .html(t('rapid_whats_new.welcome',
            {
                rapidicon: icon('#iD-logo-rapid', 'logo-rapid'),
            }));


        var body = whatsNewModal
            .append('div')
            .attr('class','modal-section body')
            .html(marked(t('rapid_whats_new.text',
            {
                rapidicon: icon('#iD-logo-rapid', 'logo-rapid'),
            })));


        body
            .append('img')
            .attr('class', 'whatsnew-image')
            .attr('src', 'dist/img/rapid-esri-splash.jpg');

        body.select('p a')
            .attr('target', '_blank');

        var buttonWrap = whatsNewModal
        .append('div')
        .attr('class', 'modal-actions');

        var exploring = buttonWrap
            .append('button')
            .on('click', function() {
                modalSelection.close();
            });

        exploring
            .append('div')
            .text(t('rapid_whats_new.nope'));

        var okayButton = buttonWrap
            .append('button')
            .attr('class', 'whats-new-okay');

        okayButton
            .append('div')
            .text(t('rapid_whats_new.ok'))
            .on('click', function() {
                modalSelection.close();
                window.open('https://mapwith.ai/rapid-esri', '_blank');
            });

        modalSelection.select('button.close')
            .attr('class','hide');
    };
}
