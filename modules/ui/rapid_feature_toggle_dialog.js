import {
    event as d3_event,
    select as d3_select
} from 'd3-selection';

import marked from 'marked';

import { t, textDirection } from '../util/locale';
import { icon } from './intro/helper';
import { svgIcon } from '../svg/icon';
import { uiModal } from './modal';
import { uiRapidViewManageDatasets } from './rapid_view_manage_datasets';


export function uiRapidFeatureToggleDialog(context, AIFeatureToggleKey, featureToggleKeyDispatcher) {

    function buildingsEnabled() {
        var msBuildings = context.rapidContext().datasets().msBuildings;
        return msBuildings && msBuildings.enabled;
    }
    function toggleBuildings() {
        var msBuildings = context.rapidContext().datasets().msBuildings;
        if (msBuildings) {
            msBuildings.enabled = !msBuildings.enabled;
            context.map().pan([0,0]);   // trigger a redraw
        }
    }

    function roadsEnabled() {
        var fbRoads = context.rapidContext().datasets().fbRoads;
        return fbRoads && fbRoads.enabled;
    }
    function toggleRoads() {
        var fbRoads = context.rapidContext().datasets().fbRoads;
        if (fbRoads) {
            fbRoads.enabled = !fbRoads.enabled;
            context.map().pan([0,0]);   // trigger a redraw
        }
    }


    function handleToggleAllClick(){
        var drawAiFeatures = context.layers().layer('ai-features');
        drawAiFeatures.enabled(!drawAiFeatures.enabled());
        redrawOnToggle();
    }


    function keyPressFormHandler(){
        if (d3_event.shiftKey &&
            d3_event.key === t('map_data.layers.ai-features.key')){
            handleToggleAllClick();
        }
    }


    function redrawOnToggle() {
        var drawAiFeatures = context.layers().layer('ai-features');
        // We need check/uncheck the 'all options' boxes, and
        // disable the other checkboxes so that the user
        // cannot interact with them.
        var roadCheckbox = d3_select('#rapid-road-toggle');
        var buildingCheckbox = d3_select('#rapid-building-toggle');
        var allCheckbox = d3_select('#rapid-all-toggle');

        // We also need to add a class to the whole option so that we
        // can style it accordingly.
        var roadOption = d3_select('#section-rapid-road-toggle');
        var buildingOption = d3_select('#section-rapid-building-toggle');

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
            .append('form')
            .attr('class', 'fillL rapid-feature rapid-stack')
            .on('keypress', keyPressFormHandler);


        var drawAiFeatures = context.layers().layer('ai-features');

        addCheckBox({
            modal: modal,
            id: 'rapid-all-toggle',
            label: t('rapid_feature_toggle.toggle_all', {
                rapidicon: icon('#iD-logo-rapid', 'logo-rapid'),
            }),
            description: null,
            handler: handleToggleAllClick,
            enabled: drawAiFeatures.showAll(),
            greyout: false
        });

        modal
            .append('div')
            .attr('class','modal-section rapid-checkbox section-divider');

        addCheckBox({
            modal: modal,
            id: 'rapid-road-toggle',
            label: t('rapid_feature_toggle.roads'),
            license: marked(t('rapid_feature_toggle.roads_license')),
            description: t('rapid_feature_toggle.roads_provided_by'),
            handler: toggleRoads,
            enabled: roadsEnabled(),
            greyout: !drawAiFeatures.showAll()
        });

        addCheckBox({
            modal: modal,
            id: 'rapid-building-toggle',
            label: t('rapid_feature_toggle.buildings'),
            description: t('rapid_feature_toggle.buildings_provided_by'),
            license: marked(t('rapid_feature_toggle.buildings_license')),
            handler: toggleBuildings,
            enabled: buildingsEnabled(),
            greyout: !drawAiFeatures.showAll()
        });

        modal
            .append('div')
            .attr('class', 'modal-section rapid-checkbox section-divider');

        var manageDatasets = modal
            .append('div')
            .attr('class','modal-section rapid-checkbox')
            .attr('id', 'section-manage-datasets')
            .on('click', function() {
                context.container().call(uiRapidViewManageDatasets(context, modalSelection));
            });

        manageDatasets
            .append('div')
            .attr('class', 'rapid-feature-label-container')
            .append('div')
            .attr('class', 'rapid-feature-label')
            .text(t('rapid_feature_toggle.view_manage_datasets'));

        manageDatasets
            .append('label')
            .attr('class', 'rapid-checkbox-label')
            .append('div')
            .call(svgIcon(textDirection === 'rtl' ? '#iD-icon-backward' : '#iD-icon-forward'));

        featureToggleKeyDispatcher.on('ai_feature_toggle', function () {
            redrawOnToggle();
        });
    };


    function addCheckBox(options) {
        var toggleOption = options.modal
            .append('div')
            .attr('class','modal-section rapid-checkbox')
            .classed('disabled', options.greyout)
            .attr('id', 'section-' + options.id);

        var toggleOptionText =  toggleOption.append('div')
            .attr('class', 'rapid-feature-label-container');

        toggleOptionText.append('div')
            .attr('class', 'rapid-feature-label')
            .html(options.label);

        if (options.description) {
            toggleOptionText
                .append('div')
                .attr('class', 'rapid-feature-label-divider');

            toggleOptionText
                .append('div')
                .attr('class', 'rapid-feature-description')
                .text(options.description);
        } else {
            toggleOptionText
                .append('span')
                .attr('class', 'rapid-feature-hotkey')
                .html('(' + AIFeatureToggleKey + ')');
        }

        if (options.license) {
            toggleOptionText
                .append('div')
                .attr('class', 'rapid-feature-label-divider');

            toggleOptionText
                .append('div')
                .attr('class', 'rapid-feature-license')
                .html(options.license);

            toggleOptionText.select('p a')
                .attr('target','_blank');
        }

        var customCheckbox = toggleOption
            .append('label')
            .attr('class', 'rapid-checkbox-label');

        customCheckbox
            .append('input')
            .attr('type', 'checkbox')
            .attr('id', options.id)
            .attr('class', 'rapid-feature-checkbox')
            .property('checked', options.enabled)
            .attr('disabled', options.greyout ? true : null)
            .on('click', options.handler);

        customCheckbox
            .append('div')
            .attr('class', 'rapid-checkbox-custom');
    }
}
