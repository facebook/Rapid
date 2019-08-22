import {
    event as d3_event,
    select as d3_select 
} from 'd3-selection';

import { t } from '../util/locale';
import { icon } from './intro/helper';
import { uiModal } from './modal';
import { getAIFeaturesToggleKey, getToggleKeyDispatcher } from './tools/ai_features_toggle';
export function uiRapidFeatureToggle(context) {
    var featureToggleKey = getAIFeaturesToggleKey(); 


    function toggleSvgBuildings () {
        var drawAiFeatures = context.layers().layer('ai-features');
        drawAiFeatures.toggleBuildings(); 
    }


    function toggleSvgRoads() {
        var drawAiFeatures = context.layers().layer('ai-features');
        drawAiFeatures.toggleRoads(); 
    }


    function handleToggleAllClick(){
        var drawAiFeatures = context.layers().layer('ai-features');
        drawAiFeatures.enabled(!drawAiFeatures.enabled()); 
        redrawOnToggle(); 
    }


    function keyPressFormHandler(){
        if (d3_event.shiftKey && 
            d3_event.key === 'R'){
            handleToggleAllClick(); 
        }
    }


    function redrawOnToggle() {
        var drawAiFeatures = context.layers().layer('ai-features');
        // We need check/uncheck the 'all options' boxes, and 
        // disable the other checkboxes so that the user
        // cannot interact with them. 
        var roadCheckbox = d3_select('#road-toggle');
        var buildingCheckbox = d3_select('#building-toggle');
        var allCheckbox = d3_select('#all-toggle');

        // We also need to add a class to the whole option so that we 
        // can style it accordingly. 
        var roadOption = d3_select('#section-road-toggle');
        var buildingOption = d3_select('#section-building-toggle');

        if (drawAiFeatures.showAll()) {
            allCheckbox.property('checked', true); 
            roadCheckbox.attr('disabled', null);  
            buildingCheckbox.attr('disabled', null);
            roadOption.classed('disabled', false); 
            buildingOption.classed('disabled', false); 
            
        } else {
            allCheckbox.property('checked', false); 
            roadCheckbox.attr('disabled', true); 
            buildingCheckbox.attr('disabled', true); 
            roadOption.classed('disabled', true); 
            buildingOption.classed('disabled', true); 
        }
    }


    return function(selection) {
        var modalSelection = uiModal(selection);

        modalSelection.select('.modal')
            .attr('class', 'modal-splash modal modal-rapid');

        var modal = modalSelection.select('.content')
            .append('div')
            .attr('class', 'fillL feature stack');


        var drawAiFeatures = context.layers().layer('ai-features');

        addCheckBox(modal, 
            'all-toggle',
            'rapid_feature_toggle.toggle_all', 
            null,
            handleToggleAllClick, 
            drawAiFeatures.showAll(),
            false,
            ); 
    
        modal
            .append('div')
            .attr('class','modal-section rapid-checkbox section-divider');

        addCheckBox(modal,
            'road-toggle',
            'rapid_feature_toggle.roads', 
            'rapid_feature_toggle.roads_provided_by',
            toggleSvgRoads,
            drawAiFeatures.showRoads(),
            !drawAiFeatures.showAll()
            ); 

        addCheckBox(modal, 
            'building-toggle',
            'rapid_feature_toggle.buildings', 
            'rapid_feature_toggle.buildings_provided_by',
            toggleSvgBuildings,
            drawAiFeatures.showBuildings(),
            !drawAiFeatures.showAll()
            ); 
    
        modalSelection.select('button.close')
            .attr('class','hide');

        getToggleKeyDispatcher().on('ai_feature_toggle', function () { 
            redrawOnToggle(); 
        });  
    };


    function addCheckBox(modal, id, label, description, handler, enabled, greyout) {
        var toggleOption = modal
        .append('div')
        .attr('class','modal-section rapid-checkbox')
        .classed('disabled', greyout)
        .attr('id', 'section-' + id);

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
            .property('checked', enabled)
            .attr('disabled', greyout ? true : null)
            .on('click', handler)
            .on('keypress', keyPressFormHandler); 
            
        customCheckbox
            .append('div')
            .attr('class', 'checkbox-custom')
    }
}
