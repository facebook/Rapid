import { rapidPowerUserFeaturesStorage } from '../ui/rapid_poweruser_features_storage'; 


export function svgOsm(projection, context, dispatch) {
    var enabled = true;


    function aiFeatureHalosEnabled() {
        return rapidPowerUserFeaturesStorage().featureEnabled('aiFeatureHalo'); 
    }

    
    function drawOsm(selection) {
        selection.classed('ai-feature-halo', aiFeatureHalosEnabled());

        selection.selectAll('.layer-osm')
            .data(['covered', 'areas', 'lines', 'points', 'labels'])
            .enter()
            .append('g')
            .attr('class', function(d) { return 'layer-osm ' + d; });

        selection.selectAll('.layer-osm.points').selectAll('.points-group')
            .data(['points', 'midpoints', 'vertices', 'turns'])
            .enter()
            .append('g')
            .attr('class', function(d) { return 'points-group ' + d; });
    }


    function showLayer() {
        var layer = context.surface().selectAll('.data-layer.osm');
        layer.interrupt();


        layer
            .classed('disabled', false)
            .classed('ai-feature-halo', aiFeatureHalosEnabled())
            .style('opacity', 0)
            .transition()
            .duration(250)
            .style('opacity', 1)
            .on('end interrupt', function () {
                dispatch.call('change');
            });
    }


    function hideLayer() {
        var layer = context.surface().selectAll('.data-layer.osm');
        layer.interrupt();

        layer
            .transition()
            .duration(250)
            .style('opacity', 0)
            .on('end interrupt', function () {
                layer.classed('disabled', true);
                dispatch.call('change');
            });
    }


    drawOsm.enabled = function(val) {
        if (!arguments.length) return enabled;
        enabled = val;

        if (enabled) {
            showLayer();
        } else {
            hideLayer();
        }

        dispatch.call('change');
        return this;
    };


    return drawOsm;
}
