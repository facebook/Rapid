import { t } from '../util/locale';
import { uiIntro } from './intro';
import { uiModal } from './modal';
import { select as d3_select } from 'd3-selection'; 

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

        var rapidIcon = d3_select(document.createElement('div')); 
        rapidIcon
            .append('svg')
            .attr('class', 'icon logo-rapid')
            .append('use')
            .attr('xlink:href', '#iD-logo-rapid')
            .attr('fill', 'white'); 

        var walkThroughIcon = d3_select(document.createElement('div')); 
        walkThroughIcon
            .append('svg')
            .attr('class', 'icon logo-walkthrough')
            .append('use')
            .attr('xlink:href', '#iD-logo-walkthrough');
    
        var editIcon = d3_select(document.createElement('div')); 
        editIcon
            .append('svg')
            .attr('class', 'icon logo-features')
            .append('use')
            .attr('xlink:href', '#iD-logo-features');

        var welcomeSection = introModal
            .append('div')
            .attr('class','modal-section')
            .append('p')
            .html(t('rapidsplash.text', 
                {
                    rapidicon: rapidIcon.html(),
                    walkthrough: walkThroughIcon.html(), 
                    edit: editIcon.html()
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
