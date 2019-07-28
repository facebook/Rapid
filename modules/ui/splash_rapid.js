import { t } from '../util/locale';
import { uiIntro } from './intro';
import { icon } from './intro/helper';
import { uiModal } from './modal';


export function uiSplashRapid(context) {

    return function(selection) {
        if (context.storage('sawRapidSplash'))
            return;

        context.storage('sawRapidSplash', true);

        var modalSelection = uiModal(selection);

        modalSelection.select('.modal')
            .attr('class', 'modal-splash modal modal-rapid');

        var introModal = modalSelection.select('.content')
            .append('div')
            .attr('class', 'fillL');

        introModal
            .append('div')
            .attr('class','modal-section')
            .append('h3').text(t('rapidsplash.welcome'));

        introModal
            .append('div')
            .attr('class','modal-section')
            .append('p')
            .html(t('rapidsplash.text',
                {
                    rapidicon: icon('#iD-logo-rapid', 'logo-rapid'),
                    walkthrough: icon('#iD-logo-walkthrough', 'logo-walkthrough'),
                    edit: icon('#iD-logo-features', 'logo-features')
                }));

        var buttonWrap = introModal
            .append('div')
            .attr('class', 'modal-actions');

        var walkthrough = buttonWrap
            .append('button')
            .attr('class', 'walkthrough')
            .on('click', function() {
                context.container().call(uiIntro(context, false));
                modalSelection.close();
            });

        walkthrough
            .append('svg')
            .attr('class', 'logo logo-features')
            .append('use')
            .attr('xlink:href', '#iD-logo-walkthrough');

        walkthrough
            .append('div')
            .text(t('rapidsplash.walkthrough'));

        var rapidWalkthrough = buttonWrap
            .append('button')
            .attr('class', 'rapid-walkthrough')
            .on('click', function() {
                context.container().call(uiIntro(context, true));
                modalSelection.close();
            });

        rapidWalkthrough
            .append('svg')
            .attr('class', 'logo logo-rapid')
            .append('use')
            .attr('xlink:href', '#iD-logo-rapid')
            .attr('fill', 'white');

        rapidWalkthrough
            .append('div')
            .text(t('rapidsplash.skip_to_rapid'));

        var startEditing = buttonWrap
            .append('button')
            .attr('class', 'start-editing')
            .on('click', modalSelection.close);

        startEditing
            .append('svg')
            .attr('class', 'logo logo-features')
            .append('use')
            .attr('xlink:href', '#iD-logo-features');

        startEditing
            .append('div')
            .text(t('rapidsplash.start'));

        modalSelection.select('button.close')
            .attr('class','hide');

    };
}
