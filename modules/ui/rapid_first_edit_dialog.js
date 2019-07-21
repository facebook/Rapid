import { t } from '../util/locale';
import { modeBrowse } from '../modes';
import { uiModal } from './modal';
import { select as d3_select } from 'd3-selection'; 
import { uiSplashRapid } from './splash_rapid'; 
import { uiRestore } from './restore';

export function uiRapidFirstEdit(context) {

    return function(selection) {
        var modalSelection = uiModal(selection);

        modalSelection.select('.modal')
            .attr('class', 'modal-splash modal modal-rapid');

        var firstEditModal = modalSelection.select('.content')
            .append('div')
            .attr('class', 'fillL');

        var rapidIcon = d3_select(document.createElement('div')); 
            rapidIcon
                .append('svg')
                .attr('class', 'icon logo-rapid')
                .append('use')
                .attr('xlink:href', '#iD-logo-rapid')
                .attr('fill', 'white'); 

        firstEditModal
            .append('div')
            .attr('class','modal-section')
            .append('h3')
            .html(t('rapid_first_edit.nice',
            {
                rapidicon: rapidIcon.html(),
            }));
            
        firstEditModal
            .append('div')
            .attr('class','modal-section')
            .append('p')
            .text(t('rapid_first_edit.text')); 

        var buttonWrap = firstEditModal
            .append('div')
            .attr('class', 'modal-actions');

        var exploring = buttonWrap
            .append('button')
            .attr('class', 'rapid-explore')            
            .on('click', function() {
                modalSelection.close();
            });

        exploring
            .append('div')
            .text(t('rapid_first_edit.exploring'));

        var loginToOsm = buttonWrap
            .append('button')
            .attr('class', 'rapid-login-to-osm') 
            .on('click', function() {
                modalSelection.close();

                var osm = context.connection();
                osm.authenticate(function(err) {
                    context.container()
                    .call(uiSplashRapid(context))
                });
            });

        loginToOsm
            .append('div')
            .text(t('rapid_first_edit.login_with_osm'));

        modalSelection.select('button.close')
            .attr('class','hide');

    };
}
