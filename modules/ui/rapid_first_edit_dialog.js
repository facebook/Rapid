import { t } from '../util/locale';
import { icon } from './intro/helper';
import { uiModal } from './modal';
import { uiSplashRapid } from './splash_rapid';


export function uiRapidFirstEdit(context) {

    return function(selection) {
        var modalSelection = uiModal(selection);

        modalSelection.select('.modal')
            .attr('class', 'modal-splash modal modal-rapid');

        var firstEditModal = modalSelection.select('.content')
            .append('div')
            .attr('class', 'fillL');

        firstEditModal
            .append('div')
            .attr('class','modal-section')
            .append('h3')
            .html(t('rapid_first_edit.nice',
            {
                rapidicon: icon('#iD-logo-rapid', 'logo-rapid'),
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
                osm.authenticate(function() {
                    context.container().call(uiSplashRapid(context));
                });
            });

        loginToOsm
            .append('div')
            .text(t('rapid_first_edit.login_with_osm'));

        modalSelection.select('button.close')
            .attr('class','hide');

    };
}
