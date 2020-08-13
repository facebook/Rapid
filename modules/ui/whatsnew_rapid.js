import { t } from '../core/localizer';
import { icon } from './intro/helper';
import { uiModal } from './modal';
import { prefs } from '../core/preferences';
import marked from 'marked';

export function uiWhatsNewRapid(context) {

    var dontShowAgain = false;

    function handleDontshowClick(){
        dontShowAgain = !dontShowAgain;
    }

    return function(selection) {
        if (prefs('sawWhatsNew') === 'true')
            return;


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
            .attr('src', context.asset('img/rapid-esri-splash.jpg'));

        body.select('p a')
            .attr('target', '_blank');


        var checkboxContainer = whatsNewModal
            .append('div')
            .attr('class', 'modal-section rapid-checkbox dontshow')
            .attr('id', 'dontshowagain');

        var checkbox = checkboxContainer
            .append('label')
            .attr('class', 'rapid-checkbox-label dontshow')
            .html(t('rapid_whats_new.dontshowagain'));

        checkbox
            .append('input')
            .attr('type', 'checkbox')
            .attr('class', 'rapid-feature-checkbox')
            .property('checked', false)
            .on('click', handleDontshowClick);

        checkbox
            .append('div')
            .attr('class', 'rapid-checkbox-custom');

        var buttonWrap = whatsNewModal
        .append('div')
        .attr('class', 'modal-actions');

        var nothanks = buttonWrap
            .append('button')
            .on('click', function() {
                prefs('sawWhatsNew', dontShowAgain);
                modalSelection.close();
            });

        nothanks
            .append('div')
            .text(t('rapid_whats_new.nope'));

        var okayButton = buttonWrap
            .append('button')
            .attr('class', 'whats-new-okay');

        okayButton
            .append('div')
            .text(t('rapid_whats_new.ok'))
            .on('click', function() {
                prefs('sawWhatsNew', dontShowAgain);
                modalSelection.close();
                window.open('https://mapwith.ai/rapid-esri', '_blank');
            });

        modalSelection.select('button.close')
            .attr('class','hide');
    };
}
