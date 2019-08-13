import { t } from '../util/locale';
import { icon } from './intro/helper';
import { uiModal } from './modal';
import { getAIFeaturesToggleKey } from './tools/fb_roads_toggle'; 
export function uiRapidFeatureToggle(context) {

    return function(selection) {
        var modalSelection = uiModal(selection);

        modalSelection.select('.modal')
            .attr('class', 'modal-splash modal modal-rapid');

        var modal = modalSelection.select('.content')
            .append('div')
            .attr('class', 'fillL feature stack');

        addCheckBox(modal, 
            'all-toggle',
            'rapid_feature_toggle.toggle_all', 
            null,
            null); 
    
        modal
            .append('div')
            .attr('class','modal-section rapid-checkbox section-divider');

        addCheckBox(modal, 
            'road-toggle',
            'rapid_feature_toggle.roads', 
            'rapid_feature_toggle.roads_provided_by',
            null); 

        addCheckBox(modal, 
            'building-toggle',
            'rapid_feature_toggle.buildings', 
            'rapid_feature_toggle.buildings_provided_by',
            null); 
    
        modalSelection.select('button.close')
            .attr('class','hide');

    };

    function addCheckBox(modal, id, label, description, handler) {
        var toggleOption = modal
        .append('div')
        .attr('class','modal-section rapid-checkbox');

        var toggleOptionText =  toggleOption.append('div')
        .attr('class', 'rapid-feature-label-container'); 
        toggleOptionText.append('div')
            .attr('class', 'rapid-feature-label')
            .html(t(label,
            {
                //The icon will simply go unused if 'rapidIcon' isn't part of the label string. 
                rapidicon: icon('#iD-logo-rapid', 'logo-rapid'),
            })); 
        
        if (description) 
        {
            toggleOptionText
            .append('div')
            .attr('class', 'rapid-feature-label-divider');

            toggleOptionText
            .append('div')
            .attr('class', 'rapid-feature-description')
            .text(t(description));  
        } else {
            toggleOptionText
            .append('span')
            .attr('class', 'rapid-feature-hotkey')
            .html('(' + getAIFeaturesToggleKey() + ')');
        }
            
        var customCheckbox = toggleOption
            .append('label')
            .attr('class', 'checkbox-label'); 

        customCheckbox
            .append('input')
            .attr('type', 'checkbox')
            .attr('id', id)
            .attr('class', 'rapid-feature-checkbox')
            .property('checked', true)
            .on('click', handler); 

        customCheckbox
            .append('div')
            .attr('class', 'checkbox-custom')
    }
}
