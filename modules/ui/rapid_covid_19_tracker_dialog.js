import { t } from '../util/locale';
import { icon } from './intro/helper';
import { uiModal } from './modal';
import { event as d3_event } from 'd3-selection';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { utilRebind } from '../util';

export function uiRapidCovid19TrackerDialog(context) {
    var dispatch = d3_dispatch('change');

    
     function render(selection) {
        var dataLayer = context.layers().layer('covid-19');
        var modalSelection = uiModal(selection);

        var _currSettings = {
            fileList: (dataLayer && dataLayer.fileList()) || null
        };

        modalSelection.select('.modal')
            .attr('class', 'modal-splash modal modal-rapid');

        var modal = modalSelection.select('.content')
            .append('form')
            .attr('class', 'fillL covid-19 rapid-stack'); 

        modal   
            .append('div')
            .attr('class','modal-heading rapid')
            .html(t('rapid_covid_19.top_label', {
                icon: icon('#iD-covid-19-icon', 'logo-rapid'),
            })); 

        modal   
            .append('div')
            .attr('class','modal-heading-desc rapid')
            .html(t('rapid_covid_19.top_label_desc'));

        modal
            .append('div')
            .attr('class','modal-section rapid-checkbox section-divider strong');


        var textSection = modal
            .append('div')
            .attr('class', 'modal-section covid-filepicker-text');

        textSection
            .append('pre')
            .attr('class', 'instructions-file')
            .text(t('settings.custom_data.file.instructions'));

        textSection
            .append('input')
            .attr('class', 'field-file')
            .attr('type', 'file')
            .property('files', _currSettings.fileList)  // works for all except IE11
            .on('change', function() {
                var files = d3_event.target.files;
                if (files && files.length) {
                    _currSettings.fileList = files;
                } else {
                    _currSettings.fileList = null;
                }
            });

            
        // insert a cancel button
        var buttonSection = modal
            .append('div')
            .attr('class', 'modal-section buttons');

        buttonSection
            .insert('button', '.ok-button')
            .attr('class', 'button cancel-button secondary-action')
            .text(t('confirm.cancel'));

        buttonSection
            .insert('button', '.ok-button')
            .attr('class', 'button ok-button action')
            .text(t('confirm.okay'));

        buttonSection.select('.cancel-button')
            .on('click.cancel', clickCancel);

        buttonSection.select('.ok-button')
            .on('click.save', clickOkay);

            
        // restore the original template
        function clickCancel() {
            this.blur();
            modalSelection.close(); 
        }

        
        // accept the current template
        function clickOkay() {            
            this.blur();
            modalSelection.close(); 
            dispatch.call('change', this, _currSettings);
        }
    }
    
    return utilRebind(render, dispatch,'on');
}
